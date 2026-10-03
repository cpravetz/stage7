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
import { assertNoGateOptOutConfig, declaresMutatingExternalAction, findManualGateDeclarations, gateOf } from './gates';
import { validateNativeTriggers } from './triggers';
import { parseCadence } from './cron';
import { altersData, completionEventId, declaredEventIds, emittedEventIds, hasDeclaredEvent, outcomeEventId } from './events';
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
  | 'matchable-event-trigger'
  | 'unresolvable-event-id'
  | 'self-subscribing-event-trigger'
  | 'declared-emit-event-unreachable'
  | 'redundant-delegation-subscription'
  | 'unschedulable-cadence'
  | 'emit-event-declared'
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

/** Lower-order tools a Skill declares it delegates to. */
function delegatedTools(skill: Tool): string[] {
  const lower = (skill.manifest as Record<string, unknown> | undefined)?.lowerOrderTools;
  return Array.isArray(lower) ? lower.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Every event id a Skill in the catalogue can actually announce.
 *
 * An event id is a contract between a producer and a subscriber, and a
 * subscriber can only be reached if some Skill really publishes that exact id.
 * Prose cannot be matched at runtime, so an id that nothing produces is an edge
 * that will never fire — which is exactly how 39 event triggers sat in the
 * shipped catalogue looking like working integrations.
 *
 * The set spans every Assistant, because a producer and its subscriber are
 * frequently in different ones (marketing reacting to a content approval).
 */
export function producibleEventIds(blueprints: Iterable<AssistantBlueprint>): Set<string> {
  return producibleEventIndex(blueprints).ids;
}

/**
 * The same index, plus a map from id to the Skills that announce it.
 *
 * An id can have more than one producer across the catalogue, and telling them
 * apart matters: only the producer that delegates to you duplicates your run.
 */
export function producibleEventIndex(blueprints: Iterable<AssistantBlueprint>): {
  ids: Set<string>;
  producers: Map<string, Tool[]>;
} {
  const ids = new Set<string>();
  const producers = new Map<string, Tool[]>();
  const publish = (id: string, tool: Tool): void => {
    ids.add(id);
    producers.set(id, [...(producers.get(id) ?? []), tool]);
  };
  for (const blueprint of blueprints) {
    const assistantId = blueprint.manifest.id;
    for (const skill of [...blueprint.canonicalSkills, ...blueprint.lowerOrderTools]) {
      for (const id of emittedEventIds(skill, assistantId)) publish(id, skill);
      publish(completionEventId(assistantId, skill.id), skill);
      // Failures and aborts are announced too, so they are subscribable.
      publish(outcomeEventId(assistantId, skill.id, 'failed'), skill);
      publish(outcomeEventId(assistantId, skill.id, 'aborted'), skill);

      // An external producer is a legitimate origin for an id, but only when
      // someone declared it to be one.
      for (const trigger of skill.triggers ?? []) {
        if (trigger.kind !== 'event') continue;
        const externalId = trigger.externalEvent ? (trigger.eventId ?? '').trim() : '';
        if (externalId) publish(externalId, skill);
      }
    }
  }
  return { ids, producers };
}

/**
 * Validates one Assistant blueprint against every checklist rule.
 */
export function validateBlueprint(
  blueprint: AssistantBlueprint,
  options: {
    layout?: ReturnType<typeof inspectLayout>;
    producibleEventIds?: Set<string>;
    eventProducers?: Map<string, Tool[]>;
  } = {},
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

    // Read from the source, not the constructed Skill: the factory stamps the
    // derived gate onto every gated Skill, so the object cannot distinguish an
    // author declaration from a derived field.
    for (const gate of findManualGateDeclarations(source.text, sourceFile)) {
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

    // Only an Overview-panel capability needs an entry point of its own; a
    // lower-order tool is reached by delegation.
    for (const issue of validateNativeTriggers(skill.id, skill.triggers, {
      requiresEntryPoint: skill.isSkill === true,
    })) {
      add('native-triggers', 'error', sourceFile, issue.message);
    }

    for (const trigger of skill.triggers ?? []) {
      if (trigger.kind === 'event') {
        // The matcher compares ids exactly, so a prose-only subscription reads as a
        // working edge in the Overview and never fires. A warning rather than an
        // error: the prose records an intent worth keeping, and the id it should name
        // is named here.
        const eventId = typeof trigger.eventId === 'string' ? trigger.eventId.trim() : '';
        if (eventId === '') {
          add(
            'matchable-event-trigger',
            'warning',
            `${sourceFile}.triggers`,
            `declares an event trigger on "${String(trigger.on ?? trigger.eventSource ?? 'an unnamed event')}" with no eventId, ` +
              'so nothing will ever fire it: the runtime matches event ids exactly and cannot read prose. ' +
              'Give this trigger the eventId of the Skill that produces that domain event — a Skill announces its own ' +
              'completion as "<assistantId>.<its-own-skillId>.completed", or as its declared emitEvent.',
          );
        } else if (
          options.producibleEventIds?.has(eventId) &&
          options.eventProducers?.get(eventId)?.some(
            (producer) =>
              delegatedTools(producer).includes(skill.id) || delegatedTools(skill).includes(producer.id),
          )
        ) {
          // The delegation already runs this Skill, and so does the subscription.
          // A `represent` Skill reached by both performs its action twice for one
          // upstream run: allocating resources, sending a message, filing a ticket.
          add(
            'redundant-delegation-subscription',
            'warning',
            `${sourceFile}.triggers`,
            `subscribes to "${eventId}", but the Skill that announces it already delegates to this one ` +
              '(or is delegated to by it), so each run arrives twice over. Keep one path: either the ' +
              'orchestrator delegates and this Skill does not subscribe, or the reverse.',
          );
        } else if (emittedEventIds(skill, assistantId).includes(eventId)) {
          // A subscription is also a dispatch edge. Naming your own event makes
          // the runtime re-run you once per emission, which for a `represent`
          // Skill means performing the action twice.
          add(
            'self-subscribing-event-trigger',
            'error',
            `${sourceFile}.triggers`,
            `subscribes to "${eventId}", which is the event this Skill itself announces, so each run would ` +
              'trigger another run of the same Skill. Subscribe to the id a different Skill declares.',
          );
        } else if (options.producibleEventIds && !options.producibleEventIds.has(eventId)) {
          // Machine-matchable but unreachable: the id looks right, so this is
          // worse than prose, because it reads as a working integration. Either a
          // producer has not been given this id yet, or the id is wrong.
          add(
            'unresolvable-event-id',
            'warning',
            `${sourceFile}.triggers`,
            `subscribes to "${eventId}" but no Skill announces that id, and the trigger does not declare ` +
              'externalEvent, so nothing will ever fire it. Point it at the eventId a producer declares ' +
              '(or at "<assistantId>.<its-own-skillId>.completed"), or set externalEvent: true if a producer ' +
              'outside stage7 publishes that id.',
          );
        }
        continue;
      }

      if (trigger.kind !== 'schedule' || trigger.cron) continue;

      // A `cadence` only becomes a live schedule when it has exactly one reading.
      // The rest is prose the scheduler must refuse rather than guess at, so catch
      // it here where the author can still fix it.
      const shorthand = typeof trigger.cadence === 'string' ? trigger.cadence : '';
      if (!parseCadence(shorthand).valid) {
        add(
          'unschedulable-cadence',
          'warning',
          `${sourceFile}.triggers`,
          `declares a schedule trigger on "${shorthand || 'no schedule expression'}" with no cron, ` +
            'so nothing will ever run it: the cadence does not say when it fires. Named periods (daily, weekly, ' +
            'monthly) leave the time open and anything qualified ("during configured windows", "when X completes") ' +
            'is conditional. Declare cron with an exact expression, such as "0 9 * * 1" for Mondays at 09:00.',
        );
      }
    }

    // A Skill that changes something should say so. It does get an event either
    // way — the runtime derives `<assistant>.<skill>.completed` for every run — but
    // a declared id is what downstream Skills and operators key off, and a derived
    // one only says "this run finished".
    // A declaration is only real if it reaches the manifest the runtime reads.
    // Reading the built Skill rather than the file text matters twice over: the
    // source lookup is keyed on filename == skill id, so a Skill whose file is
    // named differently reads as `''` and was reported as declaring nothing; and
    // a factory that accepts `emitEvent` without forwarding it into the manifest
    // produces a declaration that is present in the file and announced by
    // nothing. Both are silent failures that source-text matching cannot see.
    const declaresInSource = declaresEmitEvent(source.text);
    const announcesDeclaredEvent = hasDeclaredEvent(skill);

    if (declaresInSource && !announcesDeclaredEvent) {
      add(
        'declared-emit-event-unreachable',
        'warning',
        sourceFile,
        'declares emitEvent in source, but the built Skill does not carry it, so the event is never ' +
          'announced. Pass emitEvent to the factory in a position it forwards into the manifest.',
      );
    }

    if (altersData(skill) && !announcesDeclaredEvent) {
      add(
        'emit-event-declared',
        'warning',
        sourceFile,
        `alters data but declares no emitEvent; it emits only the derived "${completionEventId(assistantId, skill.id)}". ` +
          'Declare emitEvent if another Skill or an operator should react to this specific change.',
      );
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

    // An `aid` Skill hands the user a work product to send. One that declares a
    // mutating external action has misclassified itself, so this is an error
    // rather than a hint: the gate is being held shut by the tier backstop, not
    // by the tier, and the definition needs fixing either way.
    if (skill.tier === 'aid' && declaresMutatingExternalAction(skill)) {
      add(
        'aid-does-not-deliver',
        'error',
        sourceFile,
        `is an aid Skill but declares the mutating external action "${String((skill.manifest as Record<string, unknown>).action)}". ` +
          'Either make it represent, or make it produce a work product instead of writing',
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
      // A lower-order tool must be reachable from a Skill that owns the
      // conversation, or nothing the user can start ever reaches it. `toolId`
      // is reported because that is the field to add; `represent` is called out
      // because a gated tool with no gated parent is a write nothing can approve.
      const reachable = referencedByCanonicalSkill(blueprint, skill.id);
      if (!reachable) {
        add(
          'tier-only-entrypoints',
          'warning',
          sourceFile,
          skill.tier === 'represent'
            ? `is a represent-tier tool that no higher-order Skill in this Assistant references, so a live write is reachable with no approval above it; add it to that Skill's lowerOrderTools`
            : 'is a lower-order tool that no higher-order Skill in this Assistant references',
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

/**
 * Whether a Skill's source declares `emitEvent` itself.
 *
 * Read from the source rather than the constructed Skill, for the same reason the
 * manual-gate check does: the runtime derives an event id when none is declared,
 * so the object on disk cannot distinguish an author's choice from a derived
 * default.
 */
const DECLARES_EMIT_EVENT = /\bemitEvent\s*:/;

export function declaresEmitEvent(source: string): boolean {
  return DECLARES_EMIT_EVENT.test(source);
}

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
