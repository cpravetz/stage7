import { logger } from '@stage7-nextgen/shared';
import { PluginGenerationRequest, PluginGenerationResult, Tool } from '../types';
import { CredentialProvider } from '../services/CredentialProvider';
import { ToolRegistry } from '../services/ToolRegistry';
import { ToolDiscovery, DiscoveredTool } from '../services/ToolDiscovery';
import { CodeExecutor } from '../executors/CodeExecutor';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const TEST_CONTRACT_SYSTEM_PROMPT = `You independently derive a deterministic acceptance contract for a requested tool capability.
Do not write or assume an implementation. Return only one JSON object with this shape:
{"description":"...","cases":[{"name":"...","input":{},"expectedOutput":{},"httpMocks":[{"method":"POST","urlPattern":"https://api.example.test/path","expectedRequestBody":"...","responseStatus":200,"responseHeaders":{},"responseBody":{}}]}]}
Requirements:
- Provide 1-5 small, deterministic input/output examples that directly verify the stated capability.
- Every input and expectedOutput must be a JSON object; do not include secrets, real personal data, live network endpoints, or side effects.
- When a capability needs HTTP, include a local HTTP fixture for each expected request, with its method, URL pattern, optional exact request body, and fixed response. Use a reserved .test hostname; requests are intercepted in-process and unmatched requests are blocked.
- Expected outputs must be exact JSON values, not prose, descriptions, or wildcards.
- If the requested capability cannot be tested with deterministic inputs and outputs, return {"description":"...","cases":[]} so the tool is not deployed without a verifiable contract.
- Return no markdown fences or text outside the JSON object.`;

const PLUGIN_SYSTEM_PROMPT = `You are a senior engineer generating production-ready plugins for an AI agent platform.

  PREFER PYTHON. Generate deterministic, side-effect-free tools in Python whenever the task
  fits the standard library. Only fall back to JavaScript when the task genuinely needs
  Node built-ins that Python lacks (byte-stream handling, streaming reads, or a specific
  Node-only API). State your language choice in the "language" field.

  Output ONLY a single JSON object with this exact shape:
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "type": "code",
    "language": "python" | "javascript",
    "entrypoint": "main.py" | "index.js",
    "sourceCode": "string",
    "requirements": ["string"],
    "configSchema": { "type": "object", "properties": {} },
    "inputs": { "type": "object", "properties": {} },
    "outputs": { "type": "object", "properties": {} }
  }

  Rules:
  - sourceCode must be complete, runnable code for the specified language.
  - CodeExecutor runs sourceCode directly as a script; do not rely on module.exports or an
    external caller invoking a function. The script is the whole program.
  - Generated plugins cannot install dependencies. requirements must be an empty array.
    Stick to the language standard library: for Python that is json, os, sys, urllib,
    http, csv, re, statistics, datetime, math, base64, hashlib, and the rest of stdlib.
  - Read inputs from the global __tool_input object and print exactly ONE JSON result
    object. Nothing else may be written to stdout.
  - PYTHON: read inputs from __tool_input and print exactly one JSON result object with
    print(json.dumps(result)). Use urllib.request for HTTP. The independent contract
    fixtures will mock these calls during testing; no network access is available during
    tests, so unreachable endpoints must be handled without throwing.
  - JAVASCRIPT (fallback only): read inputs from the global __tool_input object and print
    exactly one JSON result object with console.log(JSON.stringify(result)). Use fetch for
    HTTP. Do not use top-level await, module.exports, or process.exit.
  - Do not print logs, warnings, explanations, or any other text alongside the JSON result.
  - Preserve any exact plugin ID, name, input schema, output schema, and behavior
    requested by the user prompt.
  - Implement the supplied independent acceptance contract exactly; it will be executed
    with network access and credentials disabled before deployment.
  - Include configSchema in every response; use {"type":"object","properties":{}} when no
    configuration is needed.
  - Do NOT include markdown fences or explanation text outside the JSON.`;

const PLUGIN_DEPLOY_DIR = process.env.PLUGIN_DEPLOY_DIR || '/tmp/stage7-plugins';
const MAX_PLUGIN_SOURCE_BYTES = 128 * 1024;
const MAX_TEST_CONTRACT_BYTES = 32 * 1024;
const PLUGIN_TEST_TIMEOUT_MS = 10_000;
const PLUGIN_SYNTAX_CHECK_TIMEOUT_MS = 10_000;
const MAX_PLUGIN_GENERATION_ATTEMPTS = 2;
const pluginTestContractSchema = z.object({
  description: z.string().trim().min(1).max(1_000),
  cases: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    input: z.record(z.unknown()),
    expectedOutput: z.record(z.unknown()),
    httpMocks: z.array(z.object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      urlPattern: z.string().trim().min(1).max(512)
        .refine((value) => /^https?:\/\/[^\s]+$/i.test(value), 'must be an HTTP(S) URL pattern'),
      expectedRequestBody: z.string().max(16_384).optional(),
      responseStatus: z.number().int().min(100).max(599),
      responseHeaders: z.record(z.string()).optional(),
      responseBody: z.record(z.unknown()),
    }).strict()).max(5).optional(),
  }).strict()).min(1).max(5),
}).strict();
const pluginValidationSchema = z.object({
  method: z.literal('isolated-contract-tests'),
  passed: z.literal(true),
  testCount: z.number().int().min(1).max(5),
  testNames: z.array(z.string().trim().min(1)).min(1).max(5),
  passedAt: z.string().datetime(),
}).strict();
const generatedPluginSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, 'id must be a safe plugin identifier'),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1_000),
  type: z.literal('code'),
  language: z.enum(['javascript', 'python']),
  entrypoint: z.enum(['index.js', 'main.py']),
  sourceCode: z.string().min(1),
  requirements: z.array(z.string().trim().min(1)).max(0, 'Generated plugins cannot declare uninstalled dependencies'),
  configSchema: z.record(z.unknown()),
  inputs: z.record(z.unknown()),
  outputs: z.record(z.unknown()),
}).strict().superRefine((plugin, context) => {
  if (Buffer.byteLength(plugin.sourceCode, 'utf8') > MAX_PLUGIN_SOURCE_BYTES) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceCode'],
      message: `sourceCode must not exceed ${MAX_PLUGIN_SOURCE_BYTES} bytes`,
    });
  }
  const expectedEntrypoint = plugin.language === 'javascript' ? 'index.js' : 'main.py';
  if (plugin.entrypoint !== expectedEntrypoint) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['entrypoint'],
      message: `entrypoint must be ${expectedEntrypoint} for ${plugin.language}`,
    });
  }
});

function safePluginId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id);
}

function expectedEntrypoint(language: unknown): 'index.js' | 'main.py' | undefined {
  if (language === 'javascript') return 'index.js';
  if (language === 'python') return 'main.py';
  return undefined;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export class PluginGenerator {
  private credentialProvider = CredentialProvider;
  private readonly codeExecutor = new CodeExecutor();
  private registry: ToolRegistry | null = null;
  private discovery: ToolDiscovery;

  constructor() {
    this.discovery = new ToolDiscovery();
  }

  setRegistry(registry: ToolRegistry): void {
    this.registry = registry;
  }

  private async reportBrainComplaint(requestId: unknown, reason: string, missionId?: string): Promise<void> {
    if (typeof requestId !== 'string' || !requestId.trim()) {
      logger.warn(
        { missionId, reason },
        'Cannot report rejected plugin-generation output to Brain without a request ID',
      );
      return;
    }

    const brainUrl = (process.env.BRAIN_URL || 'http://brain:3100').replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${brainUrl}/api/brain/complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: requestId.trim(), reason: reason.slice(0, 2_000), missionId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const details = await response.text();
        logger.error(
          { missionId, requestId, status: response.status, details: details.slice(0, 300) },
          'Brain rejected a plugin-generation quality complaint',
        );
        return;
      }
      logger.info(
        { missionId, requestId, reason },
        'Plugin-generation validation complaint recorded',
      );
    } catch (error) {
      logger.error(
        { missionId, requestId, error: error instanceof Error ? error.message : String(error) },
        'Failed to report a plugin-generation quality complaint',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async generateContractTestedTool(options: {
    description: string;
    requirements: string[];
    context: Record<string, unknown>;
    testContract: z.infer<typeof pluginTestContractSchema>;
    brainUrl: string;
    missionId?: string;
    repairFeedback?: string;
    maxAttempts?: number;
  }): Promise<PluginGenerationResult> {
    const {
      description,
      requirements,
      context,
      testContract,
      brainUrl,
      missionId,
    } = options;
    const basePrompt = `Generate an executable plugin for this capability:\n${description}\nRequirements: ${requirements.join(', ')}\nContext: ${JSON.stringify(context)}\n\nIndependent acceptance contract to implement exactly:\n${JSON.stringify(testContract)}`;
    let repairFeedback = options.repairFeedback || '';
    const maxAttempts = options.maxAttempts || MAX_PLUGIN_GENERATION_ATTEMPTS;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const prompt = repairFeedback
        ? `${basePrompt}\n\nThe previous generated code was rejected. Fix this specific issue without changing the contract:\n${repairFeedback}`
        : basePrompt;
      const response = await fetch(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemPrompt: PLUGIN_SYSTEM_PROMPT,
          options: { temperature: 0.2, maxTokens: 4096 },
          missionId,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error({ status: response.status, body: text.slice(0, 200) }, 'Plugin generation LLM call failed');
        return { success: false, error: `LLM returned ${response.status}: ${text.slice(0, 200)}` };
      }

      const data = await response.json() as { content?: unknown; requestId?: unknown };
      let rawPlugin: unknown;
      let validationError: string | undefined;
      if (typeof data.content !== 'string' || Buffer.byteLength(data.content, 'utf8') > MAX_PLUGIN_SOURCE_BYTES * 2) {
        validationError = 'LLM plugin response content is missing or exceeds the response size limit';
      } else {
        try {
          rawPlugin = JSON.parse(data.content);
        } catch (error) {
          validationError = `LLM plugin response must be a single JSON object: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      const validation = validationError
        ? undefined
        : generatedPluginSchema.safeParse(rawPlugin);
      if (validation && !validation.success) {
        validationError = `Generated plugin failed validation: ${validation.error.issues.map((issue) => `${issue.path.join('.') || 'plugin'} ${issue.message}`).join('; ')}`;
      }
      if (validationError || !validation?.success) {
        const reason = validationError || 'Generated plugin response could not be validated';
        await this.reportBrainComplaint(data.requestId, reason, missionId);
        repairFeedback = reason;
        continue;
      }

      const parsed = validation.data;
      if (this.registry?.get(parsed.id)) {
        const reason = `Generated plugin id '${parsed.id}' is already registered`;
        await this.reportBrainComplaint(data.requestId, reason, missionId);
        repairFeedback = reason;
        continue;
      }

      const tool: Tool = {
        id: parsed.id,
        name: parsed.name,
        description: parsed.description,
        type: 'code',
        manifest: {
          language: parsed.language,
          entrypoint: parsed.entrypoint,
          sourceCode: parsed.sourceCode,
          requirements: parsed.requirements,
          configSchema: parsed.configSchema,
          inputs: parsed.inputs,
          outputs: parsed.outputs,
          testContract,
        },
        inputSchema: parsed.inputs,
        outputSchema: parsed.outputs,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const failedCases: string[] = [];
      for (const testCase of testContract.cases) {
        const execution = await this.codeExecutor.execute({
          language: parsed.language,
          code: parsed.sourceCode,
          input: testCase.input,
          httpMocks: testCase.httpMocks,
          timeoutMs: PLUGIN_TEST_TIMEOUT_MS,
          isolated: true,
        });
        if (!execution.success) {
          failedCases.push(`${testCase.name}: execution failed: ${(execution.error || 'unknown error').slice(0, 300)}`);
          continue;
        }
        let actualOutput: unknown;
        try {
          actualOutput = JSON.parse(execution.output || '');
        } catch (error) {
          failedCases.push(`${testCase.name}: output was not one JSON value: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
        if (actualOutput === null || typeof actualOutput !== 'object' || Array.isArray(actualOutput)) {
          failedCases.push(`${testCase.name}: output must be a JSON object`);
          continue;
        }
        if (canonicalJson(actualOutput) !== canonicalJson(testCase.expectedOutput)) {
          failedCases.push(`${testCase.name}: output did not match the acceptance contract`);
        }
      }
      if (failedCases.length > 0) {
        const reason = `Generated plugin failed isolated acceptance tests: ${failedCases.join('; ')}`;
        await this.reportBrainComplaint(data.requestId, reason, missionId);
        repairFeedback = reason;
        continue;
      }

      tool.manifest.validation = {
        method: 'isolated-contract-tests',
        passed: true,
        testCount: testContract.cases.length,
        testNames: testContract.cases.map((testCase) => testCase.name),
        passedAt: new Date().toISOString(),
      };
      logger.info({ toolId: tool.id, toolName: tool.name, attempt }, 'Plugin generation completed');
      return { success: true, tool };
    }

    return { success: false, error: repairFeedback || 'Generated plugin failed validation after bounded repair attempts' };
  }

  async generate(request: PluginGenerationRequest): Promise<PluginGenerationResult> {
    logger.info({ description: request.description }, 'Plugin generation started');

    try {
      const discovered = await this.discovery.discoverAndRegister(request.description, {
        register: (tool: Tool) => {
          if (this.registry) {
            // registerOrReplace: a re-discovered tool may already be present
            // (e.g. restored from the ToolStore on boot), which must not throw.
            this.registry.registerOrReplace(tool);
          }
        },
      });

      if (discovered) {
        if (discovered.manifest?.requiresInstallation !== true) {
          logger.info({ toolId: discovered.id, source: (discovered.manifest as Record<string, unknown>)?.source }, 'External tool discovered, skipping generation');
          return { success: true, tool: discovered };
        }
        this.registry?.unregister(discovered.id);
        logger.info(
          { toolId: discovered.id, source: (discovered.manifest as Record<string, unknown>)?.source },
          'Discovered package requires installation and cannot satisfy the capability; generating an executable tool instead',
        );
      }

      const brainUrl = process.env.BRAIN_URL || 'http://brain:3100';
      const missionId = typeof request.context?.missionId === 'string'
        ? request.context.missionId
        : undefined;
      const contractResponse = await fetch(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Define deterministic acceptance tests for this capability:\n${request.description}\nRequirements: ${(request.requirements || []).join(', ')}`,
          systemPrompt: TEST_CONTRACT_SYSTEM_PROMPT,
          options: { temperature: 0.1, maxTokens: 2048 },
          missionId,
        }),
      });
      if (!contractResponse.ok) {
        const text = await contractResponse.text();
        return { success: false, error: `Acceptance contract request failed with ${contractResponse.status}: ${text.slice(0, 200)}` };
      }
      const contractData = await contractResponse.json() as { content?: unknown; requestId?: unknown };
      if (typeof contractData.content !== 'string'
        || Buffer.byteLength(contractData.content, 'utf8') > MAX_TEST_CONTRACT_BYTES) {
        const error = 'Acceptance contract is missing or exceeds the test contract size limit';
        await this.reportBrainComplaint(contractData.requestId, error, missionId);
        return { success: false, error };
      }
      let rawContract: unknown;
      try {
        rawContract = JSON.parse(contractData.content);
      } catch (error) {
        const reason = `Acceptance contract must be a single JSON object: ${error instanceof Error ? error.message : String(error)}`;
        await this.reportBrainComplaint(contractData.requestId, reason, missionId);
        return { success: false, error: reason };
      }
      const contractValidation = pluginTestContractSchema.safeParse(rawContract);
      if (!contractValidation.success) {
        const reason = `Acceptance contract failed validation: ${contractValidation.error.issues.map((issue) => `${issue.path.join('.') || 'contract'} ${issue.message}`).join('; ')}`;
        await this.reportBrainComplaint(contractData.requestId, reason, missionId);
        return { success: false, error: reason };
      }
      const testContract = contractValidation.data;
      if (Buffer.byteLength(JSON.stringify(testContract), 'utf8') > MAX_TEST_CONTRACT_BYTES) {
        const error = `Acceptance contract exceeds the ${MAX_TEST_CONTRACT_BYTES}-byte limit`;
        await this.reportBrainComplaint(contractData.requestId, error, missionId);
        return { success: false, error };
      }
      if (testContract.cases.length === 0) {
        const error = 'Acceptance contract contains no deterministic test cases; generated tools require at least one passing contract test';
        await this.reportBrainComplaint(contractData.requestId, error, missionId);
        return { success: false, error };
      }
      const repairRejectedPlugin = async (reason: string): Promise<PluginGenerationResult> => {
        const repaired = await this.generateContractTestedTool({
          description: request.description,
          requirements: request.requirements || [],
          context: request.context || {},
          testContract,
          brainUrl,
          missionId,
          repairFeedback: reason,
          maxAttempts: 1,
        });
        return repaired.success
          ? repaired
          : { success: false, error: `${reason}; bounded repair failed: ${repaired.error || 'unknown error'}` };
      };

      const userPrompt = `Generate an executable plugin for this capability:\n${request.description}\nRequirements: ${(request.requirements || []).join(', ')}\nContext: ${JSON.stringify(request.context || {})}\n\nIndependent acceptance contract to implement exactly:\n${JSON.stringify(testContract)}`;

      const response = await fetch(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          systemPrompt: PLUGIN_SYSTEM_PROMPT,
          options: { temperature: 0.2, maxTokens: 4096 },
          missionId,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error({ status: response.status, body: text.slice(0, 200) }, 'Plugin generation LLM call failed');
        return { success: false, error: `LLM returned ${response.status}: ${text.slice(0, 200)}` };
      }

      const data = await response.json() as { content?: unknown; requestId?: unknown };
      if (typeof data.content !== 'string' || Buffer.byteLength(data.content, 'utf8') > MAX_PLUGIN_SOURCE_BYTES * 2) {
        const error = 'LLM plugin response content is missing or exceeds the response size limit';
        await this.reportBrainComplaint(data.requestId, error, missionId);
        return await repairRejectedPlugin(error);
      }
      let rawPlugin: unknown;
      try {
        rawPlugin = JSON.parse(data.content);
      } catch (error) {
        const reason = `LLM plugin response must be a single JSON object: ${error instanceof Error ? error.message : String(error)}`;
        await this.reportBrainComplaint(data.requestId, reason, missionId);
        return await repairRejectedPlugin(reason);
      }
      const validation = generatedPluginSchema.safeParse(rawPlugin);
      if (!validation.success) {
        const reason = `Generated plugin failed validation: ${validation.error.issues.map((issue) => `${issue.path.join('.') || 'plugin'} ${issue.message}`).join('; ')}`;
        await this.reportBrainComplaint(data.requestId, reason, missionId);
        return await repairRejectedPlugin(reason);
      }
      const parsed = validation.data;
      if (this.registry?.get(parsed.id)) {
        const reason = `Generated plugin id '${parsed.id}' is already registered`;
        await this.reportBrainComplaint(data.requestId, reason, missionId);
        return await repairRejectedPlugin(reason);
      }
      const tool: Tool = {
        id: parsed.id,
        name: parsed.name,
        description: parsed.description,
        type: 'code',
        manifest: {
          language: parsed.language || 'javascript',
          entrypoint: parsed.entrypoint || 'index.js',
          sourceCode: parsed.sourceCode,
          requirements: parsed.requirements || [],
          configSchema: parsed.configSchema || {},
          inputs: parsed.inputs || {},
          outputs: parsed.outputs || {},
          testContract,
        },
        inputSchema: parsed.inputs || { type: 'object', properties: {} },
        outputSchema: parsed.outputs || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const failedCases: string[] = [];
      for (const testCase of testContract.cases) {
        const execution = await this.codeExecutor.execute({
          language: parsed.language,
          code: parsed.sourceCode,
          input: testCase.input,
          httpMocks: testCase.httpMocks,
          timeoutMs: PLUGIN_TEST_TIMEOUT_MS,
          isolated: true,
        });
        if (!execution.success) {
          failedCases.push(`${testCase.name}: execution failed: ${(execution.error || 'unknown error').slice(0, 300)}`);
          continue;
        }
        let actualOutput: unknown;
        try {
          actualOutput = JSON.parse(execution.output || '');
        } catch (error) {
          failedCases.push(`${testCase.name}: output was not one JSON value: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
        if (actualOutput === null || typeof actualOutput !== 'object' || Array.isArray(actualOutput)) {
          failedCases.push(`${testCase.name}: output must be a JSON object`);
          continue;
        }
        if (canonicalJson(actualOutput) !== canonicalJson(testCase.expectedOutput)) {
          failedCases.push(`${testCase.name}: output did not match the acceptance contract`);
        }
      }
      if (failedCases.length > 0) {
        const reason = `Generated plugin failed isolated acceptance tests: ${failedCases.join('; ')}`;
        await this.reportBrainComplaint(data.requestId, reason, missionId);
        return await repairRejectedPlugin(reason);
      }
      tool.manifest.validation = {
        method: 'isolated-contract-tests',
        passed: true,
        testCount: testContract.cases.length,
        testNames: testContract.cases.map((testCase) => testCase.name),
        passedAt: new Date().toISOString(),
      };

      logger.info({ toolId: tool.id, toolName: tool.name }, 'Plugin generation completed');
      return { success: true, tool };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'Plugin generation failed');
      return { success: false, error: errorMessage };
    }
  }

  async deploy(tool: Tool): Promise<{ success: boolean; deployPath?: string; error?: string }> {
    let stagingDir: string | undefined;
    try {
      const manifest = tool.manifest as Record<string, unknown>;
      const validation = generatedPluginSchema.safeParse({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        type: tool.type,
        language: manifest?.language,
        entrypoint: manifest?.entrypoint,
        sourceCode: manifest?.sourceCode,
        requirements: manifest?.requirements,
        configSchema: manifest?.configSchema,
        inputs: manifest?.inputs,
        outputs: manifest?.outputs,
      });
      if (!validation.success) {
        return {
          success: false,
          error: `Generated plugin failed validation: ${validation.error.issues.map((issue) => `${issue.path.join('.') || 'plugin'} ${issue.message}`).join('; ')}`,
        };
      }

      const contractValidation = pluginTestContractSchema.safeParse(manifest?.testContract);
      const testValidation = pluginValidationSchema.safeParse(manifest?.validation);
      if (!contractValidation.success
        || !testValidation.success
        || contractValidation.data.cases.length !== testValidation.data.testCount
        || contractValidation.data.cases.length !== testValidation.data.testNames.length
        || contractValidation.data.cases.some((testCase, index) => testCase.name !== testValidation.data.testNames[index])) {
        return {
          success: false,
          error: 'Generated plugin must pass isolated contract tests before deployment',
        };
      }

      const { language, entrypoint, sourceCode } = validation.data;
      const deployRoot = path.resolve(PLUGIN_DEPLOY_DIR);
      const pluginDir = path.resolve(deployRoot, tool.id);
      const relativePluginPath = path.relative(deployRoot, pluginDir);
      if (!relativePluginPath || relativePluginPath.startsWith('..') || path.isAbsolute(relativePluginPath)) {
        return { success: false, error: 'Plugin id resolves outside the deployment directory' };
      }
      if (this.registry?.get(tool.id) || fs.existsSync(pluginDir)) {
        return { success: false, error: `Plugin id '${tool.id}' is already registered or deployed` };
      }

      fs.mkdirSync(deployRoot, { recursive: true });
      stagingDir = fs.mkdtempSync(path.join(deployRoot, '.stage7-plugin-'));
      const sourcePath = path.join(stagingDir, entrypoint);
      fs.writeFileSync(sourcePath, sourceCode, 'utf-8');

      const syntaxCheck = language === 'javascript'
        ? spawnSync(process.execPath, ['--check', sourcePath], {
          encoding: 'utf8',
          timeout: PLUGIN_SYNTAX_CHECK_TIMEOUT_MS,
        })
        : spawnSync(
          process.env.PYTHON_BIN || 'python3',
          ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'],
          {
            encoding: 'utf8',
            input: sourceCode,
            timeout: PLUGIN_SYNTAX_CHECK_TIMEOUT_MS,
          },
        );
      if (syntaxCheck.error || syntaxCheck.status !== 0) {
        const details = syntaxCheck.error?.message
          || syntaxCheck.stderr.trim()
          || `syntax checker exited with status ${String(syntaxCheck.status)}`;
        return { success: false, error: `Generated plugin failed ${language} syntax validation: ${details}` };
      }

      fs.writeFileSync(path.join(stagingDir, 'plugin.json'), JSON.stringify({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        type: tool.type,
        language,
        entrypoint,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        testContract: contractValidation.data,
        validation: testValidation.data,
        createdAt: tool.createdAt,
        updatedAt: tool.updatedAt,
      }, null, 2), 'utf-8');

      fs.renameSync(stagingDir, pluginDir);
      stagingDir = undefined;
      if (this.registry) {
        try {
          this.registry.register(tool);
        } catch (error) {
          try {
            fs.rmSync(pluginDir, { recursive: true, force: true });
          } catch (cleanupError) {
            logger.error(
              { toolId: tool.id, error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) },
              'Failed to remove an unregistered generated plugin',
            );
          }
          throw error;
        }
        logger.info({ toolId: tool.id }, 'Plugin deployed and registered with ToolRegistry');
      } else {
        logger.info({ toolId: tool.id, deployPath: pluginDir }, 'Plugin deployed locally');
      }
      return { success: true, deployPath: pluginDir };
    } catch (err) {
      if (stagingDir && fs.existsSync(stagingDir)) {
        try {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        } catch (cleanupError) {
          logger.error(
            { stagingDir, error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) },
            'Failed to remove generated plugin staging directory',
          );
        }
      }
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'Plugin deployment failed');
      return { success: false, error: errorMessage };
    }
  }

  static listDeployed(): Array<{ id: string; name: string; deployPath: string; language: string }> {
    if (!fs.existsSync(PLUGIN_DEPLOY_DIR)) {
      return [];
    }

    const plugins: Array<{ id: string; name: string; deployPath: string; language: string }> = [];
    const entries = fs.readdirSync(PLUGIN_DEPLOY_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(PLUGIN_DEPLOY_DIR, entry.name, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (!safePluginId(manifest.id) || manifest.id !== entry.name) continue;
        plugins.push({
          id: manifest.id,
          name: manifest.name,
          deployPath: path.join(PLUGIN_DEPLOY_DIR, entry.name),
          language: manifest.language || 'javascript',
        });
      } catch {
        // skip invalid manifests
      }
    }

    return plugins;
  }

  static loadDeployed(id: string): Tool | undefined {
    if (!safePluginId(id)) return undefined;
    const manifestPath = path.join(PLUGIN_DEPLOY_DIR, id, 'plugin.json');
    if (!fs.existsSync(manifestPath)) return undefined;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (manifest.id !== id) return undefined;
      const entrypoint = expectedEntrypoint(manifest.language);
      if (!entrypoint || manifest.entrypoint !== entrypoint) return undefined;
      const sourceCode = fs.readFileSync(path.join(PLUGIN_DEPLOY_DIR, id, entrypoint), 'utf-8');

      return {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        type: manifest.type || 'code',
        manifest: {
          language: manifest.language,
          entrypoint,
          sourceCode,
          ...manifest,
        },
        inputSchema: manifest.inputSchema || { type: 'object', properties: {} },
        outputSchema: manifest.outputSchema || {},
        createdAt: new Date(manifest.createdAt),
        updatedAt: new Date(manifest.updatedAt),
      };
    } catch {
      return undefined;
    }
  }
}