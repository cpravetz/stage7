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
    "credentialSource": { "logicalKey": { "configKey": "field", "label": "Human-readable name", "sensitive": true } },
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
  - Never read configuration, credentials, or secrets from process.env, os.environ,
    os.getenv, or any other process environment API. Runtime environment variables are
    deployment settings and cannot be changed by a user at runtime.
  - Keep persistent tool configuration separate from per-execution inputs:
    configSchema is only for user-provided settings expected to remain consistent across
    runs, while inputs is for values supplied or changed for a particular execution.
    For example, a persistent account or service endpoint belongs in configSchema; a
    recipient, message, query, or other task-specific value belongs in inputs, even when
    the user supplies it. Do not put run-specific values in configSchema.
  - Declare persistent settings as properties in configSchema.properties, with accurate
    types and useful descriptions. Put every mandatory persistent setting in
    configSchema.required. Read ordinary, non-secret persistent settings from
    __skill_config["propertyName"] in JavaScript or __skill_config["property_name"] in
    Python. Never substitute environment-variable lookups for declared config properties.
  - Declare per-execution values in inputs and read them from __tool_input. For a
    per-execution secret, mark the input property with "x-stage7-secret": true,
    "format": "password", and "writeOnly": true; do not make it persistent configuration.
  - For a secret that is intentionally persistent across runs, declare its configSchema
    property and map it in credentialSource using configKey and a human-readable label.
    Mark it with "sensitive": true. Read mapped values with
    __getCredential("logicalKey") in JavaScript or __get_credential("logical_key") in
    Python. These values resolve from runtime configuration or are requested from the
    user if missing. Do not map per-execution secrets through credentialSource.
  - Never put secrets in config defaults, source code, logs, outputs, or acceptance-test
    fixtures; acceptance tests must use dummy values and must not make live requests.
  - If the tool must return a secret value, mark that output property with
    "x-stage7-secret": true. ToolExecutor stores it in Vault and returns only a
    vault:// reference to the Agent; never include real secret values in acceptance tests.
  - Do NOT include markdown fences or explanation text outside the JSON.

  EXAMPLE — Twilio SMS sender (the exact shape a generated tool must take):
  {
    "id": "sms-send",
    "name": "Send SMS",
    "description": "Send an SMS via Twilio. Requires Twilio credentials resolved through the credential provider.",
    "type": "code",
    "language": "javascript",
    "entrypoint": "index.js",
    "sourceCode": "const accountSid = __getCredential('twilio_account_sid');\nconst authToken = __getCredential('twilio_auth_token');\nconst fromNumber = __getCredential('twilio_from_number');\nconst to = __tool_input.to;\nconst body = __tool_input.body;\nif (!accountSid || !authToken || !fromNumber) { console.log(JSON.stringify({ success: false, error: 'Missing Twilio credentials. The user must supply twilio_account_sid, twilio_auth_token, and twilio_from_number via Vault.' })); return; }\nconst auth = 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64');\nconst params = new URLSearchParams();\nparams.set('From', fromNumber);\nparams.set('To', to);\nparams.set('Body', body);\nfetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() }).then(async (res) => {\n  const text = await res.text();\n  let data = text;\n  try { data = JSON.parse(text); } catch {}\n  if (res.ok && data && data.sid) { console.log(JSON.stringify({ success: true, messageId: data.sid, providerRequestId: data.sid })); }\n  else { console.log(JSON.stringify({ success: false, error: (data && data.message) || ('Twilio rejected the request (' + res.status + ')') })); }\n}).catch((err) => { console.log(JSON.stringify({ success: false, error: err.message || String(err) })); });",
    "requirements": [],
    "configSchema": { "type": "object", "properties": {} },
    "credentialSource": {
      "twilio_account_sid": { "configKey": "twilio_account_sid", "label": "Twilio Account SID" },
      "twilio_auth_token": { "configKey": "twilio_auth_token", "label": "Twilio Auth Token", "sensitive": true },
      "twilio_from_number": { "configKey": "twilio_from_number", "label": "Twilio From Number" }
    },
    "inputs": {
      "type": "object",
      "properties": {
        "to": { "type": "string", "description": "Recipient phone number in E.164 format" },
        "body": { "type": "string", "description": "Message body text" }
      },
      "required": ["to", "body"]
    },
    "outputs": {
      "type": "object",
      "properties": {
        "success": { "type": "boolean" },
        "messageId": { "type": "string" },
        "error": { "type": "string" }
      },
      "required": ["success"]
    }
  }
  In that example, every persistent credential is declared in credentialSource and read with
  __getCredential('logicalKey') — never with process.env, os.environ, or getenv. If a credential
  is missing, the tool must return a clear error telling the user which Vault secrets to supply.`;

const PLUGIN_DEPLOY_DIR = process.env.PLUGIN_DEPLOY_DIR || '/tmp/stage7-plugins';
const MAX_PLUGIN_SOURCE_BYTES = 128 * 1024;
const MAX_TEST_CONTRACT_BYTES = 32 * 1024;
const PLUGIN_TEST_TIMEOUT_MS = 10_000;
const PLUGIN_SYNTAX_CHECK_TIMEOUT_MS = 10_000;
const MAX_PLUGIN_GENERATION_ATTEMPTS = 4;
const pluginTestContractSchema = z.object({
  description: z.string().trim().min(1).max(1_000),
  cases: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    input: z.record(z.string(), z.unknown()),
    expectedOutput: z.record(z.string(), z.unknown()),
    httpMocks: z.array(z.object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      urlPattern: z.string().trim().min(1).max(512)
        .refine((value) => /^https?:\/\/[^\s]+$/i.test(value), 'must be an HTTP(S) URL pattern'),
      expectedRequestBody: z.union([z.string().max(16_384), z.record(z.string(), z.unknown())]).optional(),
      responseStatus: z.number().int().min(100).max(599),
      responseHeaders: z.record(z.string(), z.string()).optional(),
      responseBody: z.record(z.string(), z.unknown()),
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
  configSchema: z.record(z.string(), z.unknown()),
  credentialSource: z.record(z.string(), z.object({
    configKey: z.string().trim().min(1),
    label: z.string().trim().min(1).optional(),
    required: z.boolean().optional(),
    sensitive: z.boolean().optional(),
  }).strict()).optional(),
  inputs: z.record(z.string(), z.unknown()),
  outputs: z.record(z.string(), z.unknown()),
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
  const requiredConfig = Array.isArray(plugin.configSchema.required)
    ? plugin.configSchema.required.filter((field): field is string => typeof field === 'string')
    : [];
  for (const field of requiredConfig) {
    if (!Object.values(plugin.credentialSource || {}).some(
      (source) => source.configKey === field && source.required !== false,
    )) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['credentialSource'],
        message: `required config field "${field}" must be mapped to a runtime configuration request`,
      });
    }
  }
  const environmentAccess = plugin.language === 'javascript'
    ? /\bprocess\s*(?:\.\s*env\b|\[\s*['"`]env['"`]\s*\])/.test(plugin.sourceCode)
    : /\bos\s*\.\s*(?:environ\b|getenv\s*\()|\bgetenv\s*\(|\bfrom\s+os\s+import\s+[^;\n]*\b(?:environ|getenv)\b/.test(plugin.sourceCode);
  if (environmentAccess) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceCode'],
      message: 'generated plugins must use runtime configuration or credentials, not process environment variables',
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

function extractFirstJsonObject(content: string): unknown | undefined {
  // Some models wrap the JSON in prose or markdown fences. Pull the first
  // balanced top-level object out of the content so a single JSON object can be
  // parsed even when the model adds conversational text around it.
  const start = content.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = content.slice(start, i + 1);
        try { return JSON.parse(candidate); } catch { return undefined; }
      }
    }
  }
  return undefined;
}

function extractFirstJsonArray(content: string): unknown | undefined {
  const start = content.indexOf('[');
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        const candidate = content.slice(start, i + 1);
        try { return JSON.parse(candidate); } catch { return undefined; }
      }
    }
  }
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
      const nonce = `plugin-gen-${attempt}-${Date.now()}`;
      const prompt = repairFeedback
        ? `${basePrompt}\n\nThe previous generated code was rejected. Fix this specific issue without changing the contract:\n${repairFeedback}\nRetry nonce: ${nonce}`
        : `${basePrompt}\nRetry nonce: ${nonce}`;
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
        // Models frequently wrap the JSON in prose or markdown fences. Pull the
        // first balanced top-level object out of the content before parsing so
        // a single JSON object survives conversational wrappers.
        rawPlugin = extractFirstJsonObject(data.content);
        if (rawPlugin === undefined) {
          // Some models answer in pure prose with no JSON at all. Ask for a
          // JSON-only retry before giving up, so a conversational wrapper does
          // not abort generation on the first attempt.
          if (attempt < maxAttempts) {
            const retryNonce = `plugin-json-retry-${attempt}-${Date.now()}`;
            repairFeedback = `Your response must be a single JSON object and nothing else. Do not include markdown fences, prose, or explanation. Output only the JSON object described in the system prompt.\nRetry nonce: ${retryNonce}`;
            continue;
          }
          validationError = 'LLM plugin response did not contain a single JSON object';
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
        // Give the model the exact required JSON shape so a schema-shaped
        // rejection can be self-corrected instead of retried blindly.
        repairFeedback = `${reason}\n\nYour response must be a single JSON object with EXACTLY this shape and nothing else (no markdown fences, no prose, no explanation):\n${JSON.stringify({
          id: 'string (lowercase, safe identifier)',
          name: 'string',
          description: 'string',
          type: 'code',
          language: 'javascript | python',
          entrypoint: 'index.js | main.py',
          sourceCode: 'complete runnable code reading __tool_input and printing one JSON result',
          requirements: [],
          configSchema: { type: 'object', properties: {} },
          credentialSource: { logicalKey: { configKey: 'field', label: 'Human-readable name', sensitive: true } },
          inputs: { type: 'object', properties: {} },
          outputs: { type: 'object', properties: {} },
        })}`;
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
          ...(parsed.credentialSource ? { credentialSource: parsed.credentialSource } : {}),
          inputs: parsed.inputs,
          outputs: parsed.outputs,
          testContract,
        },
        inputSchema: parsed.inputs,
        configSchema: parsed.configSchema,
        outputSchema: parsed.outputs,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const failedCases: string[] = [];
      const dummyCredentials: Record<string, string> = {};
      for (const logicalKey of Object.keys(parsed.credentialSource || {})) {
        // Isolated tests cannot receive real credentials (they are rejected by
        // the executor). Provide dummy values so a generated tool that gates on
        // `__getCredential` still proceeds to the mocked HTTP call and the
        // acceptance contract can validate behavior. Real secrets never appear
        // in test fixtures.
        dummyCredentials[logicalKey] = `test-${logicalKey}`;
      }
      for (const testCase of testContract.cases) {
        const execution = await this.codeExecutor.execute({
          language: parsed.language,
          code: parsed.sourceCode,
          input: testCase.input,
          httpMocks: testCase.httpMocks,
          timeoutMs: PLUGIN_TEST_TIMEOUT_MS,
          isolated: true,
          testCredentials: dummyCredentials,
        }, dummyCredentials);
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
      const contractNonce = `contract-gen-${Date.now()}`;
      const contractResponse = await fetch(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Define deterministic acceptance tests for this capability:\n${request.description}\nRequirements: ${(request.requirements || []).join(', ')}\nRetry nonce: ${contractNonce}`,
          systemPrompt: TEST_CONTRACT_SYSTEM_PROMPT,
          options: { temperature: 0.1, maxTokens: 2048 },
          missionId,
        }),
      });
      if (!contractResponse.ok) {
        const text = await contractResponse.text();
        return { success: false, error: `Acceptance contract request failed with ${contractResponse.status}: ${text.slice(0, 200)}` };
      }
      let contractData: { content?: unknown; requestId?: unknown } = await contractResponse.json() as { content?: unknown; requestId?: unknown };
      if (typeof contractData.content !== 'string'
        || Buffer.byteLength(contractData.content, 'utf8') > MAX_TEST_CONTRACT_BYTES) {
        const error = 'Acceptance contract is missing or exceeds the test contract size limit';
        await this.reportBrainComplaint(contractData.requestId, error, missionId);
        return { success: false, error };
      }
      let rawContract: unknown;
      let contractRepairFeedback = '';
      for (let contractAttempt = 1; contractAttempt <= MAX_PLUGIN_GENERATION_ATTEMPTS; contractAttempt++) {
        const contractContent = typeof contractData.content === 'string' ? contractData.content : '';
        rawContract = extractFirstJsonObject(contractContent);
        if (rawContract !== undefined) break;
        if (contractAttempt < MAX_PLUGIN_GENERATION_ATTEMPTS) {
          contractRepairFeedback = 'Your response must be a single JSON object and nothing else. Do not include markdown fences, prose, or explanation. Output only the JSON object described in the system prompt.';
          const retryNonce = `contract-retry-${contractAttempt}-${Date.now()}`;
          const retryResponse = await fetch(`${brainUrl}/api/brain/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `Define deterministic acceptance tests for this capability:\n${request.description}\nRequirements: ${(request.requirements || []).join(', ')}\n\nThe previous response was not a single JSON object. ${contractRepairFeedback}\nRetry nonce: ${retryNonce}`,
              systemPrompt: TEST_CONTRACT_SYSTEM_PROMPT,
              options: { temperature: 0.1, maxTokens: 2048 },
              missionId,
            }),
          });
          if (retryResponse.ok) {
            contractData = await retryResponse.json() as { content?: unknown; requestId?: unknown };
          } else {
            break;
          }
        }
      }
      if (rawContract === undefined) {
        const reason = 'Acceptance contract must be a single JSON object: response did not contain a JSON object';
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

      const userPromptNonce = `plugin-user-${Date.now()}`;
      const userPrompt = `Generate an executable plugin for this capability:\n${request.description}\nRequirements: ${(request.requirements || []).join(', ')}\nContext: ${JSON.stringify(request.context || {})}\n\nIndependent acceptance contract to implement exactly:\n${JSON.stringify(testContract)}\nRetry nonce: ${userPromptNonce}`;

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

      let data: { content?: unknown; requestId?: unknown } = await response.json() as { content?: unknown; requestId?: unknown };
      if (typeof data.content !== 'string' || Buffer.byteLength(data.content, 'utf8') > MAX_PLUGIN_SOURCE_BYTES * 2) {
        const error = 'LLM plugin response content is missing or exceeds the response size limit';
        await this.reportBrainComplaint(data.requestId, error, missionId);
        return await repairRejectedPlugin(error);
      }
      let rawPlugin: unknown;
      let pluginRepairFeedback = '';
      for (let pluginAttempt = 1; pluginAttempt <= MAX_PLUGIN_GENERATION_ATTEMPTS; pluginAttempt++) {
        const pluginContent = typeof data.content === 'string' ? data.content : '';
        rawPlugin = extractFirstJsonObject(pluginContent);
        if (rawPlugin !== undefined) break;
        if (pluginAttempt < MAX_PLUGIN_GENERATION_ATTEMPTS) {
          pluginRepairFeedback = 'Your response must be a single JSON object and nothing else. Do not include markdown fences, prose, or explanation. Output only the JSON object described in the system prompt.';
          const pluginRetryNonce = `plugin-retry-${pluginAttempt}-${Date.now()}`;
          const retryResponse = await fetch(`${brainUrl}/api/brain/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `${userPrompt}\n\nThe previous response was not a single JSON object. ${pluginRepairFeedback}\nRetry nonce: ${pluginRetryNonce}`,
              systemPrompt: PLUGIN_SYSTEM_PROMPT,
              options: { temperature: 0.2, maxTokens: 4096 },
              missionId,
            }),
          });
          if (retryResponse.ok) {
            data = await retryResponse.json() as { content?: unknown; requestId?: unknown };
          } else {
            break;
          }
        }
      }
      if (rawPlugin === undefined) {
        const reason = 'LLM plugin response must be a single JSON object: response did not contain a JSON object';
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
          credentialSource: parsed.credentialSource || {},
          inputs: parsed.inputs || {},
          outputs: parsed.outputs || {},
          testContract,
        },
        inputSchema: parsed.inputs || { type: 'object', properties: {} },
        configSchema: parsed.configSchema || { type: 'object', properties: {} },
        ...(parsed.credentialSource ? { credentialSource: parsed.credentialSource } : {}),
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
        logger.error({ toolId: tool.id, toolName: tool.name, sourceCode: parsed.sourceCode.slice(0, 2_000), testContract, failedCases }, 'Plugin generation failed isolated acceptance tests');
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
        credentialSource: manifest?.credentialSource,
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
        credentialSource: manifest?.credentialSource,
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