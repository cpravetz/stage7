export type EntityId = string;
export type TenantId = string;
export type OrgId = string;
export type UserId = string;
export type MissionId = string;
export type ArtifactId = string;

export interface BaseEntity {
  id: EntityId;
  tenantId: TenantId;
  orgId: OrgId;
  createdAt: Date;
  updatedAt: Date;
  version?: number;
}

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Skill / tool output presentation contract
// ---------------------------------------------------------------------------
// Core does not know what any individual skill produces, and must not encode skill
// specifics. Instead every skill MAY return one or more presentation blocks: plain,
// already-user-formatted text that a renderer can display verbatim without understanding
// the domain. A renderer only has to know this generic shape.
//
// A skill is not required to emit `present`. When it is absent, the renderer falls back to
// displaying the structured `data` payload generically. Emitting `present` is how a skill
// controls its own user-facing formatting (script pages, song lead sheets, plain-text
// reports) without the core learning anything about that skill.

export type PresentationBlockKind = 'text' | 'markdown' | string;

export interface PresentationBlock {
  /** Stable identifier for the block, e.g. 'report', 'artifact'. Used for keys and tests. */
  id: string;
  /** Optional heading shown above the block. */
  title?: string;
  /**
   * Pre-formatted plain text, with the layout the skill intends the user to see.
   * Rendered verbatim with line breaks preserved. Must not contain raw JSON.
   */
  body: string;
  /** How to interpret `body`. Defaults to 'text' (verbatim, whitespace preserved). */
  kind?: PresentationBlockKind;
}

/** The generic envelope a skill or tool result is expected to conform to. */
export interface PresentableOutput {
  success?: boolean;
  status?: string;
  message?: string;
  error?: string;
  /** Machine-readable payload. Never rendered as raw JSON when `present` is supplied. */
  data?: unknown;
  /** Ordered, already-user-formatted blocks. See PresentationBlock. */
  present?: PresentationBlock[];
}
