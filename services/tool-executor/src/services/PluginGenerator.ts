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
import { listVaultSecretNames as listVaultSecretNamesFromVault } from '../utils/vaultClient';

const TEST_CONTRACT_SYSTEM_PROMPT = `Create small, deterministic input/output tests for the requested tool capability. Do not write an implementation.
When a mission goal is provided, it defines the scope: the capability must be necessary for that goal and preserve its operation and medium. If it conflicts with the goal, return no cases.
Return the tests themselves, not instructions for creating tests. Return one JSON object:
{"description":"...","cases":[{"name":"...","input":{},"credentials":{},"expectedOutput":{},"httpMocks":[{"method":"POST","urlPattern":"https://api.example.test/path","expectedRequestBody":"...","responseStatus":200,"responseHeaders":{},"responseBody":{}}]}]}
Requirements:
- Provide 1-5 small, deterministic input/output examples that directly verify the stated capability.
- Each case's input and expectedOutput must be JSON objects. Credentials must be an object whose values are strings. Do not include real secrets or personal data.
- When a capability needs HTTP, include a local HTTP fixture for each expected request, with its method, URL pattern, optional exact request body, and fixed JSON-object response. Fixture URLs must match the URL the implementation will call; use the known provider hostname if the API has a fixed hostname, or a reserved .test hostname for configurable endpoints. Requests are intercepted in-process and unmatched requests are blocked, so no live request is made. Use * for variable path segments such as account IDs.
- When a request uses persistent configuration such as an API endpoint or account ID, include dummy string values in the case's credentials object keyed by logical credential key. Use an endpoint matching the HTTP fixture. Never include real credentials.
- Key credentials by the provider's own vocabulary, using the exact names the provider documents for them (for example a Twilio account SID and auth token, or an API key). Do not invent generic keys such as "endpoint" or "token" when the provider has specific configuration, and do not omit the provider's account identifier. The generated tool is required to read these exact keys.
- Expected outputs must be exact JSON values, not prose, descriptions, or wildcards.
- If the requested capability cannot be tested with deterministic inputs and outputs, return {"description":"...","cases":[]} so the tool is not deployed without a verifiable contract.
- Return no markdown fences or text outside the JSON object.`;

const PLUGIN_SYSTEM_PROMPT = `You are a senior engineer generating production-ready plugins for an AI agent platform.

  The original mission goal, when provided, is authoritative. Generate only a capability
  necessary for that goal, preserving the requested operation and medium.

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
  - Implement HTTP authentication the way the provider documents it. Do not pass a
    provider credential somewhere the provider does not read it: for HTTP Basic
    authentication build the header from BOTH the username and password
    (base64 of "user:pass"), not one of them alone, and never send a token as a
    bare header value when the provider expects a scheme. A credential that is read
    but not actually used to authenticate is a defect even if the test fixture
    passes, so make the auth exactly match the real API.
  - Use the acceptance contract's OWN names for inputs and credentials. Read each
    credential with the exact key the contract's credentials object uses, and each
    input with the exact key its input object uses. Do not rename them, and do not
    read a value (such as an endpoint URL) from a different key than the contract
    supplies. If the contract provides an endpoint URL, build the request URL from
    that value; if it does not, use the provider's fixed, documented URL.
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
    configSchema.required. Every required config property must also declare its
    credential source inline on the property: vaultSecretId for Vault-backed secrets,
    envVar for deployment-managed environment variables, or configKey for nested
    configuration paths. Read its resolved value using __getCredential in JavaScript
    or __get_credential in Python. This applies to non-secret settings as well, so
    missing values can be requested. Optional non-secret settings may be read from
    __skill_config["propertyName"] in JavaScript or __skill_config["property_name"] in
    Python.
  - Declare per-execution values in inputs and read them from __tool_input. For a
    per-execution secret, mark the input property with "x-stage7-secret": true,
    "format": "password", and "writeOnly": true; do not make it persistent configuration.
  - For a secret that is intentionally persistent across runs, declare its configSchema
    property and mark it with "sensitive": true and a vaultSecretId or envVar. Read
    mapped values with __getCredential("logicalKey") in JavaScript or
    __get_credential("logical_key") in Python. These values resolve from runtime
    configuration or are requested from the user if missing. Do not map per-execution
    secrets through inline credential source declarations on configSchema properties.
    When the capability request identifies an existing Vault secret by name, use that
    exact name as vaultSecretId for the corresponding property; do not substitute a
    guessed logical key or request the secret value.
  - Never put secrets in config defaults, source code, logs, outputs, or acceptance-test
    fixtures; acceptance tests must use dummy values and must not make live requests.
  - Do not silently convert provider failures into an "accepted": false style result.
    On an HTTP error, capture the response status and the provider's parsed JSON body
    (code and message) and include them in the JSON result so the caller can see the
    exact rejection (for example a trial-account unverified-recipient error). Raise
    only when no structured result can be produced; prefer a result object carrying
    the error text over an unhandled exception.
  - If the tool must return a secret value, mark that output property with
    "x-stage7-secret": true. ToolExecutor stores it in Vault and returns only a
    vault:// reference to the Agent; never include real secret values in acceptance tests.
  - Do NOT include markdown fences or explanation text outside the JSON.

  Declare only the provider and configuration actually needed for the requested capability.
  Never invent a provider, default account, sender, credential, or successful result.`;

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
    credentials: z.record(z.string(), z.string()).optional(),
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
  }).strict()).max(5),
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
  // Credential sources are now declared inline on each configSchema property
  // (vaultSecretId / envVar / configKey). Required config fields must declare a
  // credential source so missing values can be requested at runtime.
  const properties = (plugin.configSchema.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
  const required = Array.isArray(plugin.configSchema.required) ? plugin.configSchema.required : [];
  for (const [field, propertySchema] of Object.entries(properties)) {
    if (!propertySchema || (propertySchema.required !== true && !required.includes(field))) continue;
    const property = propertySchema;
    const hasCredentialSource = property.vaultSecretId || property.envVar || property.configKey;
    if (!hasCredentialSource) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['configSchema', 'properties', field],
        message: `required config field "${field}" must declare a credential source (vaultSecretId, envVar, or configKey)`,
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

export function extractFirstJsonObject(content: string): unknown | undefined {
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

export function looksTruncated(content: string): boolean {
  // A well-formed JSON object ends with balanced braces and no open string.
  // If the scan hits end-of-content with depth > 0 or an unterminated string,
  // the model was cut off before the object closed (typical of maxTokens caps).
  if (content.trim().length === 0) return false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  return depth > 0 || inString;
}

// ---------------------------------------------------------------------------
// Focused remediation framework
// ---------------------------------------------------------------------------
// A remediation step is an *incremental query about one specific defect*, not a
// re-send of the entire generation prompt with a generic "try again" note.
// Three rules, applied everywhere below:
//   1. Incremental — each query names the concrete defect and carries only the
//      fragment needed to fix it (a truncated prefix to complete, the offending
//      field, the failing test case, or the id to change).
//   2. Focused context — remediation drops the bulky, decision-irrelevant parts
//      of the original prompt (requirements list, serialized context blob) and
//      keeps only what regeneration needs (capability + acceptance contract).
//   3. Stronger models — every attempt shares a stable routingSessionId so the
//      Brain's per-session model exclusion rotates to a *different* model after
//      each failure, and remediation attempts are accuracy-weighted so the
//      rotation prefers stronger models.

export const PLUGIN_JSON_SHAPE_JSON = JSON.stringify({
  id: 'string (lowercase, safe identifier)',
  name: 'string',
  description: 'string',
  type: 'code',
  language: 'javascript | python',
  entrypoint: 'index.js | main.py',
  sourceCode: 'complete runnable code reading __tool_input and printing one JSON result',
  requirements: [],
  configSchema: { type: 'object', properties: {} },
  inputs: { type: 'object', properties: {} },
  outputs: { type: 'object', properties: {} },
});

export const CONTRACT_JSON_SHAPE_JSON = JSON.stringify({
  description: 'string',
  cases: [
    {
      name: 'string',
      input: {},
      credentials: {},
      expectedOutput: {},
      httpMocks: [],
    },
  ],
});

function missionScope(context: Record<string, unknown> | undefined): string {
  const goal = typeof context?.missionGoal === 'string' ? context.missionGoal.trim() : '';
  const task = typeof context?.taskObjective === 'string' ? context.taskObjective.trim() : '';
  if (!goal) return '';
  return `Original mission goal (authoritative scope): ${goal}\n${task ? `Assigned task: ${task}\n` : ''}The capability must directly support the goal. Do not substitute another operation or medium.\n\n`;
}

/**
 * Names of secrets already stored in the Vault, so generated tools can bind to
 * real, configured credentials instead of inventing identifiers that resolve to
 * nothing and force a fresh credential prompt for a value the operator already
 * supplied.
 */
export async function listVaultSecretNames(): Promise<string[]> {
  try {
    // A short deadline keeps a slow or absent Vault from delaying generation: the
    // secret list only sharpens the prompt, and generation must not depend on it.
    return await listVaultSecretNamesFromVault('system', 3_000);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Vault secret listing failed for plugin generation');
    return [];
  }
}

/** Credential-related vault names worth showing the generator, bounded to keep the prompt small. */
export function credentialSecretHint(names: string[], max = 40): string {
  const credentialLike = names.filter((name) => !/^(tool:[^:]+:searxng|eventTypes)/i.test(name));
  if (credentialLike.length === 0) return '';
  return `\nCredentials already stored in the Vault (use these exact names as vaultSecretId when the tool needs them; do not invent new names):\n${credentialLike.slice(0, max).map((name) => `- ${name}`).join('\n')}\n`;
}

export interface RemediationOptions {
  temperature: number;
  maxTokens: number;
  optimizeFor: 'accuracy' | 'balanced';
  routingSessionId: string;
}

export function remediationOptions(params: {
  attempt: number;
  routingSessionId: string;
  maxTokens: number;
  baseTemperature: number;
}): RemediationOptions {
  const { attempt, routingSessionId, maxTokens, baseTemperature } = params;
  const isFirst = attempt <= 1;
  return {
    // Vary temperature on retries so a near-deterministic weak model does not
    // reproduce the identical rejected output.
    temperature: isFirst ? baseTemperature : Math.min(0.7, Math.round((baseTemperature + 0.2) * 10) / 10),
    maxTokens,
    // First attempt uses normal routing; every remediation attempt is
    // accuracy-weighted and, via the shared routingSessionId, excludes the
    // model(s) that already failed.
    optimizeFor: isFirst ? 'balanced' : 'accuracy',
    routingSessionId,
  };
}

function truncatedExcerpt(content: string | undefined, max = 4000): string {
  const trimmed = (content || '').slice(0, max);
  return trimmed ? `\n\nYour previous response (truncated to ${max} chars):\n${trimmed}` : '';
}

// Truncated output: complete the JSON from where it stopped (cheapest, most
// incremental fix — the prefix already contains the model's own work).
export function buildPluginTruncatedCompletionQuery(previousContent: string): string {
  const prefix = previousContent.slice(0, 8000);
  return `Your previous response was cut off before the JSON object closed. Continue it from exactly where it stopped.\n\nPrefix produced so far:\n${prefix}\n\nOutput ONLY the remainder of the JSON so that prefix + your output together form one complete, valid JSON object. Do not repeat the prefix and do not add prose or markdown fences.`;
}

// Not-JSON / prose-only / unparseable: focused envelope query. Keeps the
// capability + contract (needed to regenerate) but drops requirements + context.
export function buildPluginContentRepairQuery(params: {
  description: string;
  testContract: unknown;
  reason: string;
  previousContent?: string;
}): string {
  const { description, testContract, reason, previousContent } = params;
  return `Your previous response could not be used as the plugin JSON object.\nReason: ${reason}${truncatedExcerpt(previousContent)}\n\nGenerate the plugin again for this capability:\n${description}\n\nIndependent acceptance contract to implement exactly:\n${JSON.stringify(testContract)}\n\nReturn ONLY one JSON object with exactly this shape and nothing else (no prose, no markdown fences):\n${PLUGIN_JSON_SHAPE_JSON}`;
}

// Schema-invalid: name the offending fields, no need to restate the capability
// when the previous object was structurally close; include it as a fallback.
export function buildPluginSchemaRepairQuery(params: {
  reason: string;
  description?: string;
  testContract?: unknown;
  previousContent?: string;
}): string {
  const { reason, description, testContract, previousContent } = params;
  const regen = description
    ? `\n\nCapability: ${description}\nAcceptance contract to implement exactly:\n${JSON.stringify(testContract)}`
    : '';
  return `Your previous plugin JSON failed validation.\nReason: ${reason}${truncatedExcerpt(previousContent)}${regen}\n\nReturn ONLY one JSON object with exactly this shape and nothing else (no prose, no markdown fences):\n${PLUGIN_JSON_SHAPE_JSON}`;
}

// Registry conflict: narrow defect — keep the code, only change the id.
export function buildPluginRegistryRepairQuery(id: string): string {
  return `The plugin id '${id}' is already registered. Return the same plugin JSON you just produced but with a new, unique, lowercase id (keep every other field identical).\n\nReturn ONLY one JSON object with exactly this shape and nothing else (no prose, no markdown fences):\n${PLUGIN_JSON_SHAPE_JSON}`;
}

// Test failure: fix only the code against the specific failing cases.
export function buildPluginTestFailureRepairQuery(params: {
  description: string;
  testContract: unknown;
  sourceCode: string;
  failedCases: string[];
}): string {
  const { description, testContract, sourceCode, failedCases } = params;
  return `Your tool's code failed its isolated acceptance tests. Fix ONLY the code so the cases below pass; do not change the acceptance contract.\n\nCapability: ${description}\nAcceptance contract:\n${JSON.stringify(testContract)}\n\nFailing cases:\n${failedCases.map((c) => `- ${c}`).join('\n')}\n\nCurrent sourceCode:\n${sourceCode}\n\nWhen a case reports a credential or output mismatch, do not weaken or mock the real provider call. Align the implementation with the contract: read credentials through __get_credential using the configSchema logical keys the contract supplies, call the real provider endpoint the fixture stands in for, and return exactly the JSON keys and values the case expects. Never make the tool report success without performing the provider request.\n\nReturn ONLY one JSON object with exactly this shape and nothing else (no prose, no markdown fences):\n${PLUGIN_JSON_SHAPE_JSON}`;
}

// Acceptance-contract defect: focused query about the contract only.
export function buildContractRepairQuery(params: {
  description: string;
  requirements: string[];
  reason: string;
  previousContent?: string;
}): string {
  const { description, requirements, reason } = params;
  const readableReason = reason
    .replace(/\bcases\.(\d+)/g, (_match, index: string) => `test case ${Number(index) + 1}`)
    .replace(/\bhttpMocks\.(\d+)/g, (_match, index: string) => `HTTP fixture ${Number(index) + 1}`)
    .replace(/Invalid input: expected record, received \w+/gi, 'must be a JSON object')
    .replace(/Invalid input: expected string, received \w+/gi, 'must be a string');
  return `Create deterministic tests for: ${description}${requirements.length ? `\nRequirements: ${requirements.join('; ')}` : ''}\nCorrect these problems: ${readableReason}\nReturn the test data itself as one JSON object, not a plan or instructions.`;
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

function describeOutputMismatch(expected: unknown, actual: unknown, path = '$'): string {
  if (canonicalJson(expected) === canonicalJson(actual)) return '';
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return `${path}: array length differs`;
    for (let index = 0; index < expected.length; index++) {
      const difference = describeOutputMismatch(expected[index], actual[index], `${path}[${index}]`);
      if (difference) return difference;
    }
  } else if (expected && actual && typeof expected === 'object' && typeof actual === 'object'
    && !Array.isArray(expected) && !Array.isArray(actual)) {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    for (const key of Object.keys(expectedRecord).sort()) {
      const childPath = `${path}.${key.replace(/[^a-zA-Z0-9_-]/g, '?').slice(0, 80)}`;
      if (!(key in actualRecord)) return `${childPath}: missing field`;
      const difference = describeOutputMismatch(expectedRecord[key], actualRecord[key], childPath);
      if (difference) return difference;
    }
    if (Object.keys(actualRecord).some((key) => !(key in expectedRecord))) return `${path}: unexpected field`;
  }
  return `${path}: value or type differs`;
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
    secretHint?: string;
    capabilityRequest?: Record<string, unknown>;
    /** The capability phrase the agent asked for, used to record what the tool was created for. */
    capability?: string;
  }): Promise<PluginGenerationResult> {
    const {
      description,
      requirements,
      context,
      testContract,
      brainUrl,
      missionId,
      secretHint = '',
      capability,
    } = options;
    const capabilityRequest = options.capabilityRequest ?? {
      ...(typeof capability === 'string' ? { capability } : {}),
      description,
      requirements,
      ...(missionId ? { missionId } : {}),
      ...(typeof context.missionGoal === 'string' ? { missionGoal: context.missionGoal } : {}),
    };
    const basePrompt = `Generate an executable plugin for this capability:\n${description}\nRequirements: ${requirements.join(', ')}\nContext: ${JSON.stringify(context)}\n${secretHint}\nIndependent acceptance contract to implement exactly:\n${JSON.stringify(testContract)}`;
    const maxAttempts = options.maxAttempts || MAX_PLUGIN_GENERATION_ATTEMPTS;
    // Stable per-generation routing session: every attempt below shares it so
    // the Brain excludes models that already failed and rotates to a new one.
    const routingSessionId = `plugin-gen:${missionId || 'tool'}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    // Focused remediation query for the *next* attempt. null = use the full
    // first-attempt prompt. Each defect class builds its own minimal query.
    let focusedQuery: string | null = options.repairFeedback
      ? buildPluginContentRepairQuery({ description, testContract, reason: options.repairFeedback })
      : null;
    let lastReason = options.repairFeedback || 'Generated plugin failed validation after bounded repair attempts';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const nonce = `plugin-gen-${attempt}-${Date.now()}`;
      const prompt = `${missionScope(context)}${focusedQuery ?? basePrompt}\nRetry nonce: ${nonce}`;
      const response = await fetch(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemPrompt: PLUGIN_SYSTEM_PROMPT,
          options: remediationOptions({ attempt, routingSessionId, maxTokens: 8192, baseTemperature: 0.2 }),
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
          // Some models answer in prose or markdown fences, or truncate. Fix the
          // specific defect with a focused query instead of re-sending the whole
          // generation prompt.
          if (attempt < maxAttempts) {
            focusedQuery = looksTruncated(data.content)
              ? buildPluginTruncatedCompletionQuery(data.content)
              : buildPluginContentRepairQuery({
                description,
                testContract,
                reason: 'response was not a JSON object (prose or markdown fences only)',
                previousContent: data.content,
              });
            lastReason = 'LLM plugin response did not contain a single JSON object';
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
        lastReason = reason;
        // Focused query naming the exact validation failure; no full re-send.
        focusedQuery = buildPluginSchemaRepairQuery({
          reason,
          description,
          testContract,
          previousContent: typeof data.content === 'string' ? data.content : undefined,
        });
        continue;
      }

      const parsed = validation.data;
      if (this.registry?.get(parsed.id)) {
        const reason = `Generated plugin id '${parsed.id}' is already registered`;
        await this.reportBrainComplaint(data.requestId, reason, missionId);
        lastReason = reason;
        // Narrow defect: only the id must change.
        focusedQuery = buildPluginRegistryRepairQuery(parsed.id);
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
        configSchema: parsed.configSchema,
        outputSchema: parsed.outputs,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const failedCases: string[] = [];
      // Credential sources are now declared inline on each configSchema property
      // (vaultSecretId / envVar / configKey). Collect the logical keys so the
      // isolated test harness can supply dummy values.
      const configProperties = (parsed.configSchema.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
      const dummyCredentials: Record<string, string> = {};
      for (const [logicalKey, propertySchema] of Object.entries(configProperties)) {
        const schema = propertySchema || {};
        const hasCredentialSource = schema.vaultSecretId || schema.envVar || schema.configKey;
        if (!hasCredentialSource) continue;
        // Isolated tests cannot receive real credentials (they are rejected by
        // the executor). Provide dummy values so a generated tool that gates on
        // `__getCredential` still proceeds to the mocked HTTP call and the
        // acceptance contract can validate behavior. Real secrets never appear
        // in test fixtures.
        dummyCredentials[logicalKey] = `test-${logicalKey}`;
      }
      for (const testCase of testContract.cases) {
        const testCredentials = { ...dummyCredentials, ...testCase.credentials };
        const execution = await this.codeExecutor.execute({
          language: parsed.language,
          code: parsed.sourceCode,
          input: testCase.input,
          httpMocks: testCase.httpMocks,
          timeoutMs: PLUGIN_TEST_TIMEOUT_MS,
          isolated: true,
          testCredentials,
        }, testCredentials);
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
          failedCases.push(`${testCase.name}: output did not match the acceptance contract (${describeOutputMismatch(testCase.expectedOutput, actualOutput)})`);
        }
      }
      if (failedCases.length > 0) {
        const reason = `Generated plugin failed isolated acceptance tests: ${failedCases.join('; ')}`;
        await this.reportBrainComplaint(data.requestId, reason, missionId);
        lastReason = reason;
        // Focused query: current source + only the failing cases to fix.
        focusedQuery = buildPluginTestFailureRepairQuery({
          description,
          testContract,
          sourceCode: parsed.sourceCode,
          failedCases,
        });
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

    return { success: false, error: lastReason };
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
      const contractRoutingSessionId = `contract-gen:${missionId || 'tool'}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const contractNonce = `contract-gen-${Date.now()}`;
      const scope = missionScope(request.context);
      const contractResponse = await fetch(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${scope}Create deterministic input/output tests for: ${request.description}\nRequirements: ${(request.requirements || []).join('; ')}\nRetry nonce: ${contractNonce}`,
          systemPrompt: TEST_CONTRACT_SYSTEM_PROMPT,
          options: remediationOptions({ attempt: 1, routingSessionId: contractRoutingSessionId, maxTokens: 4096, baseTemperature: 0.1 }),
          missionId,
        }),
      });
      if (!contractResponse.ok) {
        const text = await contractResponse.text();
        return { success: false, error: `Acceptance contract request failed with ${contractResponse.status}: ${text.slice(0, 200)}` };
      }
      let contractData: { content?: unknown; requestId?: unknown } = await contractResponse.json() as { content?: unknown; requestId?: unknown };
      let testContract: z.infer<typeof pluginTestContractSchema> | undefined;
      let contractRepairFeedback = '';
      for (let contractAttempt = 1; contractAttempt <= MAX_PLUGIN_GENERATION_ATTEMPTS; contractAttempt++) {
        if (typeof contractData.content !== 'string'
          || Buffer.byteLength(contractData.content, 'utf8') > MAX_TEST_CONTRACT_BYTES) {
          contractRepairFeedback = 'Acceptance contract is missing or exceeds the test contract size limit';
        } else {
          const rawContract = extractFirstJsonObject(contractData.content);
          if (rawContract === undefined) {
            contractRepairFeedback = looksTruncated(contractData.content)
              ? 'Acceptance contract was truncated before the JSON object completed (unbalanced braces or unterminated string). Return a complete, self-contained JSON object and nothing else; reduce the number or size of test cases if needed so it fits within the limit.'
              : 'Acceptance contract must be a single JSON object: response did not contain a JSON object';
          } else {
            const validation = pluginTestContractSchema.safeParse(rawContract);
            if (validation.success) {
              testContract = validation.data;
              break;
            }
            contractRepairFeedback = `Acceptance contract failed validation: ${validation.error.issues.map((issue) => `${issue.path.join('.') || 'contract'} ${issue.message}`).join('; ')}`;
          }
        }
        await this.reportBrainComplaint(contractData.requestId, contractRepairFeedback, missionId);
        if (contractAttempt < MAX_PLUGIN_GENERATION_ATTEMPTS) {
          const retryNonce = `contract-retry-${contractAttempt}-${Date.now()}`;
          // Focused query about the contract defect only, not a full re-send.
          const retryPrompt = buildContractRepairQuery({
            description: request.description,
            requirements: request.requirements || [],
            reason: contractRepairFeedback,
          });
          const retryResponse = await fetch(`${brainUrl}/api/brain/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `${scope}${retryPrompt}\nRetry nonce: ${retryNonce}`,
              systemPrompt: TEST_CONTRACT_SYSTEM_PROMPT,
              options: remediationOptions({ attempt: contractAttempt + 1, routingSessionId: contractRoutingSessionId, maxTokens: 4096, baseTemperature: 0.1 }),
              missionId,
            }),
          });
          if (!retryResponse.ok) {
            const text = await retryResponse.text();
            return { success: false, error: `Acceptance contract retry failed with ${retryResponse.status}: ${text.slice(0, 200)}` };
          }
          contractData = await retryResponse.json() as { content?: unknown; requestId?: unknown };
        }
      }
      if (!testContract) return { success: false, error: contractRepairFeedback };
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
      const secretHint = credentialSecretHint(
        Array.isArray(request.context?.vaultSecretNames)
          ? request.context.vaultSecretNames.filter((name): name is string => typeof name === 'string')
          : [],
      );
      const pluginCapabilityRequest = {
        capability: typeof request.capability === 'string' ? request.capability : undefined,
        description: request.description,
        requirements: request.requirements || [],
        ...(missionId ? { missionId } : {}),
        ...(typeof request.context?.missionGoal === 'string' ? { missionGoal: request.context.missionGoal } : {}),
      };
      const repairRejectedPlugin = async (reason: string): Promise<PluginGenerationResult> => {
        const repaired = await this.generateContractTestedTool({
          description: request.description,
          requirements: request.requirements || [],
          context: request.context || {},
          capability: request.capability,
          testContract,
          brainUrl,
          missionId,
          repairFeedback: reason,
          maxAttempts: 1,
          secretHint,
          capabilityRequest: pluginCapabilityRequest,
        });
        return repaired.success
          ? repaired
          : { success: false, error: `${reason}; bounded repair failed: ${repaired.error || 'unknown error'}` };
      };

      const userPromptNonce = `plugin-user-${Date.now()}`;
      const userPrompt = `Generate an executable plugin for this capability:\n${request.description}\nRequirements: ${(request.requirements || []).join(', ')}\nContext: ${JSON.stringify(request.context || {})}\n${secretHint}\nIndependent acceptance contract to implement exactly:\n${JSON.stringify(testContract)}\nRetry nonce: ${userPromptNonce}`;
      const pluginRoutingSessionId = `plugin-user:${missionId || 'tool'}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

      const response = await fetch(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          systemPrompt: PLUGIN_SYSTEM_PROMPT,
          options: remediationOptions({ attempt: 1, routingSessionId: pluginRoutingSessionId, maxTokens: 8192, baseTemperature: 0.2 }),
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
      for (let pluginAttempt = 1; pluginAttempt <= MAX_PLUGIN_GENERATION_ATTEMPTS; pluginAttempt++) {
        const pluginContent = typeof data.content === 'string' ? data.content : '';
        rawPlugin = extractFirstJsonObject(pluginContent);
        if (rawPlugin !== undefined) break;
        if (pluginAttempt < MAX_PLUGIN_GENERATION_ATTEMPTS) {
          // Focused query for the specific defect (truncated prefix to complete,
          // or a JSON-envelope fix), not a full prompt re-send.
          const retryPrompt = looksTruncated(pluginContent)
            ? buildPluginTruncatedCompletionQuery(pluginContent)
            : buildPluginContentRepairQuery({
              description: request.description,
              testContract,
              reason: 'response was not a JSON object (prose or markdown fences only)',
              previousContent: pluginContent,
            });
          const pluginRetryNonce = `plugin-retry-${pluginAttempt}-${Date.now()}`;
          const retryResponse = await fetch(`${brainUrl}/api/brain/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `${retryPrompt}\nRetry nonce: ${pluginRetryNonce}`,
              systemPrompt: PLUGIN_SYSTEM_PROMPT,
              options: remediationOptions({ attempt: pluginAttempt + 1, routingSessionId: pluginRoutingSessionId, maxTokens: 8192, baseTemperature: 0.2 }),
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
          configSchema: parsed.configSchema || { type: 'object', properties: {} },
          inputs: parsed.inputs || {},
          outputs: parsed.outputs || {},
          testContract,
          ...(pluginCapabilityRequest ? { capabilityRequest: pluginCapabilityRequest } : {}),
        },
        inputSchema: parsed.inputs || { type: 'object', properties: {} },
        configSchema: parsed.configSchema || { type: 'object', properties: {} },
        outputSchema: parsed.outputs || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const failedCases: string[] = [];
      // Credential sources are now declared inline on each configSchema property
      // (vaultSecretId / envVar / configKey). Collect the logical keys so the
      // isolated test harness can supply dummy values.
      const configProperties = (parsed.configSchema?.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
      const dummyCredentials = Object.fromEntries(
        Object.entries(configProperties)
          .filter(([, schema]) => schema && (schema.vaultSecretId || schema.envVar || schema.configKey))
          .map(([key]) => [key, `test-${key}`]),
      );
      for (const testCase of testContract.cases) {
        const testCredentials = { ...dummyCredentials, ...testCase.credentials };
        const execution = await this.codeExecutor.execute({
          language: parsed.language,
          code: parsed.sourceCode,
          input: testCase.input,
          httpMocks: testCase.httpMocks,
          timeoutMs: PLUGIN_TEST_TIMEOUT_MS,
          isolated: true,
          testCredentials,
        }, testCredentials);
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
          failedCases.push(`${testCase.name}: output did not match the acceptance contract (${describeOutputMismatch(testCase.expectedOutput, actualOutput)})`);
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
      const errorMessage = err instanceof Error ? err.message : String(err);
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
        // A tool that is already registered is live and usable; a new-generation
        // attempt for the same capability must never take it out of service.
        // Report the existing tool so the caller keeps a working capability.
        const live = this.registry?.get(tool.id);
        if (live) {
          return { success: true, deployPath: fs.existsSync(pluginDir) ? pluginDir : undefined };
        }
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
        configSchema: manifest?.configSchema,
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
          this.registry.markDeployedPlugin?.(tool.id);
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
      const errorMessage = err instanceof Error ? err.message : String(err);
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