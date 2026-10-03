/**
 * Core ADK vocabulary.
 *
 * The three primitives in ADK_OVERVIEW.md §1 — Assistants, Skills and Tools —
 * meet here as types. Everything else in `src/adk` is a rule about these types
 * rather than a rule of its own: the tier table drives approval (Overview §2.4),
 * `isSkill` draws the UI boundary (Overview §3.1), and `schemaVersion` lets a
 * deployed folder keep working against records written by an older one
 * (Overview §5).
 */

import type { SchemaRecord, SkillTrigger, Tool } from '../types';

/** ADK_OVERVIEW.md §2.4. Exactly one tier per Skill, and it alone drives approval. */
export const GOVERNANCE_TIERS = ['advise', 'aid', 'represent'] as const;

export type GovernanceTier = (typeof GOVERNANCE_TIERS)[number];

export function isGovernanceTier(value: unknown): value is GovernanceTier {
  return typeof value === 'string' && (GOVERNANCE_TIERS as readonly string[]).includes(value);
}

/**
 * The immutable blueprint of an Assistant, as read from its own folder
 * (ADK_OVERVIEW.md §2.1, the Folder Rule).
 *
 * There is deliberately no `deliveryMode`, `knowledgeDelivery`, or any other
 * knob for how domain knowledge reaches the runtime. On deployment stage7 seeds
 * every `domainKnowledgeFiles` entry into the instance Vector Knowledge Store
 * alongside the Assistant's dynamic learnings, and RAG queries that one store
 * (Overview §4.1).
 */
export interface AssistantManifest {
  id: string;
  name: string;
  description: string;
  /** Blueprint version. Deployments are stamped `9.0.0` for the ADK layout. */
  version: string;
  /** Folder-relative paths of the static domain knowledge documents. */
  domainKnowledgeFiles: string[];
  /** Optional *domain* policies, e.g. `enforceGroupIsolation`. Never approval. */
  policies?: Record<string, unknown>;
}

/** A rendered block for the Skill's Overview panel (Overview §2.2). */
export interface RenderBlock {
  id: string;
  title: string;
  kind: 'text' | 'markdown' | 'table' | 'chart';
  body: string;
}

export interface SkillExecutionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  present?: RenderBlock[];
  /** Escalation card text; must never carry a stack trace or internal path. */
  escalate?: { title: string; body: string; actions?: string[] };
}

/**
 * The `ctx` handed to every handler (ADK_DEVELOPER_GUIDE.md §4).
 *
 * The `store` half is the one contract the developer guide treats as settled;
 * the `llm` / `knowledge` / `chat` / `tools` halves are the additions the guide
 * marks **[PROPOSED]** in §4.2, and are therefore typed here but always
 * resolved defensively by the runtime so a host that has not wired them yet
 * degrades to an honest failure instead of a crash.
 */
export interface ExecutionContext {
  input: any;
  /** Merged config: configSchema defaults + persisted Mongo values (Overview §5.1.4). */
  config: Record<string, any>;
  /** Decrypted secrets from the stage7 Secrets Service. */
  credentials: Record<string, string>;
  getCredential(logicalKey: string): string | undefined;
  store: {
    /** Loads a collection through its hydration adapters (Overview §5.1.3). */
    load<T = any>(collectionName: string, defaultValue?: T[]): Promise<T[]>;
    /** Persists records, stamping `_schemaVersion` and `_updatedAt` (Overview §5.1.2). */
    save<T = any>(collectionName: string, data: T[]): Promise<void>;
  };
  render: {
    text(type: 'report' | 'card' | 'summary', title: string, lines: string[]): RenderBlock;
    markdown(title: string, body: string): RenderBlock;
    list(title: string, items: string[]): RenderBlock;
  };
  llm: {
    generateStructured<T = any>(prompt: string, outputSchema: SchemaRecord): Promise<T>;
  };
  knowledge: {
    query(text: string, opts?: { topK?: number }): Promise<Array<{ text: string; source: string }>>;
  };
  chat: {
    ask(question: string): Promise<string>;
    notify(message: string): Promise<void>;
  };
  tools: {
    call<T = any>(toolId: string, input: any): Promise<SkillExecutionResult<T>>;
  };
  emit: {
    success(result: SkillExecutionResult): SkillExecutionResult;
    failure(error: unknown): void;
    notConnected(reason: string, details?: Record<string, unknown>): SkillExecutionResult;
  };
}

/**
 * A Skill or Tool as declared inside an Assistant folder.
 *
 * `isSkill` is not optional in practice: every blueprint file sets it, and
 * `npm run adk:validate` rejects a definition that leaves it implicit, because
 * an unset flag silently decides whether a capability gets a UX panel.
 */
export interface SkillBlueprint {
  id: string;
  name: string;
  description: string;
  tier: GovernanceTier;
  schemaVersion: number;
  isSkill: boolean;
  inputSchema: SchemaRecord;
  outputSchema: SchemaRecord;
  configSchema?: SchemaRecord;
  triggers: SkillTrigger[];
  domainKnowledge?: string;
  /** Lower-order tool ids this higher-order Skill orchestrates, when any. */
  calls?: string[];
}

/**
 * A hydrated Assistant folder: its manifest plus the runtime artefacts the
 * loader materialised from it.
 */
export interface AssistantBlueprint {
  manifest: AssistantManifest;
  /** Absolute path of the folder this blueprint was loaded from. */
  root: string;
  /** Absolute paths of every file listed in `domainKnowledgeFiles`. */
  knowledgeFiles: string[];
  /** Absolute path of the system prompt fragment, when the folder ships one. */
  systemPrompt?: string;
  canonicalSkills: Tool[];
  lowerOrderTools: Tool[];
}

export function allBlueprintSkills(blueprint: AssistantBlueprint): Tool[] {
  return [...blueprint.canonicalSkills, ...blueprint.lowerOrderTools];
}
