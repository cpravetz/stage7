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

/**
 * A single outbound link belonging to a presentation block. `body` is plain text and
 * cannot carry a clickable link, so a block that reports a set of real artifacts (job
 * postings, documents, articles) attaches them here instead of pasting raw URLs into
 * prose. The renderer shows each one as an anchor that opens in a new tab.
 */
export interface PresentationLink {
  /** Text of the link, e.g. "Senior Engineer — Acme". */
  label: string;
  /** Absolute http(s) URL. Entries without one are ignored by the renderer. */
  url: string;
  /** Optional secondary line, e.g. location, salary or source board. */
  detail?: string;
}

export type PresentationActionType = 'delete';

export interface PresentationAction {
  type: PresentationActionType;
  label: string;
  target: string; // e.g., 'skill-store'
  collection: string;
  key: string;
  itemId: string;
}

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
  /**
   * Optional outbound links rendered under `body`, each opening in a new tab. A block
   * whose whole point is a set of items (rather than a count of them) lists them here
   * so none of them is left for the user to go and find.
   */
  links?: PresentationLink[];
  /** Optional actions (e.g., delete) that can be performed on this block or its items. */
  actions?: PresentationAction[];
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
