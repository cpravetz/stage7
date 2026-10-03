/**
 * Blueprint validation — the `npm run adk:validate` rules.
 *
 * Each rule below maps to a numbered item of the ADK implementation checklist,
 * so a failure names the rule it broke rather than just saying a folder looks
 * wrong. The validator is deliberately structural: it reads the built blueprint
 * and the source text, never executing a handler, so it can run in CI against a
 * folder nobody has deployed.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Tool } from '../types';
import { expectedSubfolder, inspectLayout } from './blueprint';
import { assertNoGateOptOutConfig, assertNoManualGate, gateOf } from './gates';
import { validateNativeTriggers } from './triggers';
import { isGovernanceTier } from './types';
import type { AssistantBlueprint } from './types';

export type RuleId =
  | 'folder-isolation'
  | 'env-var-leak'
  | 'manifest-integrity'
  | 'knowledge-consolidated'
  | 'no-routing-enum'
  | 'explicit-isSkill'
  | 'single-tier'
  | 'no-manual-gate'
  | 'tier-only-entrypoints'
  | 'overview-action'
  | 'collection-references'
  | 'secret-flagging'
  | 'schema-versioned'
  | 'native-triggers'
  | 'aid-does-not-deliver';

export interface ValidationFinding {
  rule: RuleId;
  severity: 'error' | 'warning';
  assistantId: string;
  location: string;
  message: string;
}

export interface ValidationReport {
  assistantId: string;
  root: string;
  findings: ValidationFinding[];
  skillCount: number;
  canonicalCount: number;
  toolCount: number;
  ok: boolean;
}

/**
 * Routing enums (checklist §3).
 *
 * These are the property names that used to make a Skill pick an operation from
 * a dropdown. What matters is not the spelling but the shape: a property whose
 * values are a closed list of *what the Skill should do*, rather than a value in
 * the domain. `priority` and `format` are domain values and stay.
 */
const ROUTING_ENUM_KEYS = new Set(['operation', 'mode', 'action', 'op', 'operationType', 'actionType', 'intent']);

export interface RoutingEnumContext {
  schema: unknown;
  path: string;
  skillId: string;
  assistantId: string;
  findings: ValidationFinding[];
}

function walkSchema(node: unknown, pathParts: string[], ctx: RoutingEnumContext): void {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => walkSchema(entry, [...pathParts, String(index)], ctx));
    return;
  }
  if (typeof node !== 'object' || node === null) return;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const next = [...pathParts, key];
    if (ROUTING_ENUM_KEYS.has(key)) {
      const enumValues = (value as any)?.enum;
      const isClosedList =
        Array.isArray(enumValues) && enumValues.length > 1 && enumValues.every((entry: unknown) => typeof entry === 'string');
      const isSelect = key === 'action' || key === 'mode' || key === 'operation' || key === 'op';

      if (isClosedList && isSelect) {
        ctx.findings.push({
          rule: 'no-routing-enum',
          severity: 'error',
          assistantId: ctx.assistantId,
          location: `${ctx.path}.${next.join('.')}`,
          message:
            `"${key}" is a routing enum (${(enumValues as string[]).join(', ')}). ` +
            'Split the distinct operations into single-purpose lower-order tools and let the higher-order Skill select among them from the request.',
        });
      } else if (isClosedList) {
        ctx.findings.push({
          rule: 'no-routing-enum',
          severity: 'error',
          assistantId: ctx.assistantId,
          location: `${ctx.path}.${next.join('.')}`,
          message: `"${key}" declares a closed list of behaviours; express the choice as separate lower-order tools instead.`,
        });
      }
    }
    walkSchema(value, next, ctx);
  }
}

/** Environment variables that are stage7 platform facts, not Assistant facts. */
const PLATFORM_ENV_ALLOWLIST = new Set([
  'NODE_ENV',
  'STORAGE_DIR',
  'ARTIFACTS_URL',
  'PATH',
  'HOME',
  'LANG',
  'TZ',
  'MONGODB_URI',
  'VAULT_ADDR',
  'JWT_SECRET',
]);

const PROCESS_ENV_PATTERN = /process\s*\.\s*env\s*(?:\.\s*([A-Za-z_][A-Za-z0-9_]*)|\[\s*['"]([^'"]+)['"]\s*\])/g;

export interface EnvVarFinding {
  name: string;
  file: string;
  line: number;
}

export function scanForEnvVars(source: string, file: string): EnvVarFinding[] {
  const findings: EnvVarFinding[] = [];
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    PROCESS_ENV_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PROCESS_ENV_PATTERN.exec(line)) !== null) {
      const name = match[1] ?? match[2];
      if (!name || PLATFORM_ENV_ALLOWLIST.has(name)) continue;
      findings.push({ name, file, line: index + 1 });
    }
  });
  return findings;
}

const SECRET_NAME_PATTERN = /(api[-_]?key|token|secret|password|passwd|credential|private[-_]?key|client[-_]?secret)/i;

function isSchemaProperty(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates one Assistant blueprint against every checklist rule.
 */
export function validateBlueprint(
  blueprint: AssistantBlueprint,
  options: { layout?: ReturnType<typeof inspectLayout> } = {},
): ValidationReport {
  const assistantId = blueprint.manifest.id;
  const findings: ValidationFinding[] = [];
  const add = (
    rule: RuleId,
    severity: 'error' | 'warning',
    location: string,
    message: string,
  ): void => {
    findings.push({ rule, severity, assistantId, location, message });
  };

  const layout = options.layout ?? inspectLayout(blueprint.root);
  for (const folder of layout.missing) {
    add('folder-isolation', 'error', `${folder}/`, `folder is required by the ADK layout but does not exist`);
  }

  const skills = [...blueprint.canonicalSkills, ...blueprint.lowerOrderTools];

  if (blueprint.knowledgeFiles.length !== blueprint.manifest.domainKnowledgeFiles.length) {
    add(
      'manifest-integrity',
      'error',
      'assistant.json.domainKnowledgeFiles',
      'lists a domain knowledge file that could not be resolved on disk',
    );
  }

  for (const skill of skills) {
    const location = `${expectedSubfolder(skill.isSkill === true)}/${skill.id}`;
    const source = readSkillSource(blueprint.root, skill.id);
    const sourceFile = source.file ?? `${expectedSubfolder(skill.isSkill === true)}/${skill.id}.ts`;

    for (const finding of scanForEnvVars(source.text, sourceFile)) {
      add(
        'env-var-leak',
        'error',
        `${sourceFile}:${finding.line}`,
        `reads process.env.${finding.name}; Assistant configuration must come from configSchema (persisted to Mongo) or from a property marked isSecret (routed to the stage7 Secrets Service)`,
      );
    }

    if (skill.isSkill !== true && skill.isSkill !== false) {
      add('explicit-isSkill', 'error', sourceFile, 'does not declare isSkill explicitly');
    }

    if (!isGovernanceTier(skill.tier)) {
      add(
        'single-tier',
        'error',
        sourceFile,
        `declares tier "${String(skill.tier)}"; every Skill declares exactly one of advise, aid, represent`,
      );
    }

    for (const gate of assertNoManualGate(skill as unknown as Record<string, any>, sourceFile)) {
      add('no-manual-gate', 'error', gate.path, gate.message);
    }

    for (const gate of assertNoGateOptOutConfig(skill.configSchema, sourceFile)) {
      add('no-manual-gate', 'error', gate.path, gate.message);
    }

    const declaredVersion = (skill as any).schemaVersion;
    if (typeof declaredVersion !== 'number' || !Number.isInteger(declaredVersion) || declaredVersion < 1) {
      add(
        'schema-versioned',
        'error',
        sourceFile,
        'must declare an integer schemaVersion for its input, config and output schemas',
      );
    }

    for (const issue of validateNativeTriggers(skill.id, skill.triggers)) {
      add('native-triggers', 'error', sourceFile, issue.message);
    }

    if (skill.isSkill === true) {
      const label = (skill.manifest as Record<string, unknown> | undefined)?.actionLabel;
      if (typeof label !== 'string' || label.trim() === '') {
        add(
          'overview-action',
          'warning',
          sourceFile,
          'mounts an Overview panel but declares no actionLabel; the button falls back to the Skill name',
        );
      }
    }

    if (skill.tier === 'represent' && skill.isSkill !== true) {
      add(
        'tier-only-entrypoints',
        'error',
        sourceFile,
        'is a represent-tier tool; a tool that performs external actions must be reachable only through a gated represent higher-order Skill',
      );
    }

    if (skill.tier === 'aid' && looksLikeItDelivers(skill)) {
      add(
        'aid-does-not-deliver',
        'warning',
        sourceFile,
        'is an aid Skill that appears to declare outbound delivery; an aid Skill hands the user a work product to send themselves',
      );
    }

    for (const key of ['inputSchema', 'configSchema'] as const) {
      const schema = (skill as any)[key];
      if (!isSchemaProperty(schema)) continue;
      walkSchema(schema, [key], {
        schema,
        path: sourceFile,
        skillId: skill.id,
        assistantId,
        findings,
      });
    }

    for (const gate of secretFlaggingFindings(skill, sourceFile)) {
      add('secret-flagging', 'error', gate.location, gate.message);
    }

    if (skill.isSkill === false) {
      const reachable = referencedByCanonicalSkill(blueprint, skill.id);
      if (!reachable) {
        add(
          'tier-only-entrypoints',
          'warning',
          sourceFile,
          'is a lower-order tool that no higher-order Skill in this Assistant references',
        );
      }
    }
  }

  const ids = new Set<string>();
  for (const skill of skills) {
    if (ids.has(skill.id)) {
      add('explicit-isSkill', 'error', skill.id, 'duplicate Skill id inside this Assistant');
    }
    ids.add(skill.id);
  }

  return {
    assistantId,
    root: blueprint.root,
    findings,
    skillCount: skills.length,
    canonicalCount: blueprint.canonicalSkills.length,
    toolCount: blueprint.lowerOrderTools.length,
    ok: findings.every((finding) => finding.severity !== 'error'),
  };
}

const SKILL_SOURCE_EXTENSIONS = ['.ts', '.js'];

function readSkillSource(root: string, skillId: string): { text: string; file?: string } {
  for (const folder of ['skills', 'tools']) {
    for (const extension of SKILL_SOURCE_EXTENSIONS) {
      const relative = path.join(folder, `${skillId}${extension}`);
      const absolute = path.join(root, relative);
      if (!fs.existsSync(absolute)) continue;
      try {
        return { text: fs.readFileSync(absolute, 'utf8'), file: relative };
      } catch {
        continue;
      }
    }
  }
  return { text: '' };
}

/** Whether an `aid` Skill's config points at an outbound delivery system. */
function looksLikeItDelivers(skill: Tool): boolean {
  const manifest = (skill.manifest ?? {}) as Record<string, unknown>;
  const system = typeof manifest.system === 'string' ? manifest.system : '';
  const vendor = typeof manifest.vendor === 'string' ? manifest.vendor : '';
  return Boolean(system || vendor);
}

/**
 * A config property whose name says it is a credential must be flagged
 * `isSecret: true`, so the value is routed to the Secrets Service instead of
 * being written to Mongo next to the rest of the configuration (checklist §7).
 */
export function secretFlaggingFindings(skill: Tool, sourceFile: string): Array<{ location: string; message: string }> {
  const configSchema = skill.configSchema as Record<string, any> | undefined;
  if (!isSchemaProperty(configSchema) || !isSchemaProperty(configSchema.properties)) return [];

  const findings: Array<{ location: string; message: string }> = [];
  for (const [key, raw] of Object.entries(configSchema.properties)) {
    if (!isSchemaProperty(raw)) continue;
    const looksSecret = SECRET_NAME_PATTERN.test(key) || raw.sensitive === true || raw.format === 'password';
    if (!looksSecret) continue;
    if (raw.isSecret === true) continue;
    findings.push({
      location: `${sourceFile}.configSchema.properties.${key}`,
      message:
        'looks like a credential but is not marked isSecret:true, so it would be persisted to Mongo instead of the stage7 Secrets Service',
    });
  }
  return findings;
}

/** Whether any canonical Skill in the Assistant delegates to this tool id. */
export function referencedByCanonicalSkill(blueprint: AssistantBlueprint, toolId: string): boolean {
  return blueprint.canonicalSkills.some((skill) => {
    const declared = (skill.manifest as Record<string, any> | undefined)?.lowerOrderTools;
    if (Array.isArray(declared) && declared.includes(toolId)) return true;
    const source = readSkillSource(blueprint.root, skill.id).text;
    return source.includes(toolId);
  });
}

/** Renders a report as the text `adk:validate` prints. */
export function formatReport(report: ValidationReport): string {
  const lines: string[] = [];
  const status = report.ok ? 'OK' : 'FAILED';
  lines.push(
    `${status}  ${report.assistantId}  (${report.canonicalCount} skills, ${report.toolCount} tools, ${report.findings.length} findings)`,
  );

  for (const finding of report.findings) {
    lines.push(`  ${finding.severity === 'error' ? 'error' : 'warn '} [${finding.rule}] ${finding.location}: ${finding.message}`);
  }

  return lines.join('\n');
}
