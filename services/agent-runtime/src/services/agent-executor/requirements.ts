import { BRAIN_ROUTING_SESSION_CONTEXT_KEY, receiptMatchesRequiredAction } from '@stage7-nextgen/shared'
import { CREATE_TOOL_ACTION, DELEGATE_ACTION, LIST_TOOLS_ACTION } from './constants'
import type { AgentActionOutcome, AgentActionReceipt, RequiredAction } from './types'
import { asRecord } from './util'

// ---------------------------------------------------------------------------
// Task specification: everything the executor reads out of `task.input`
// ---------------------------------------------------------------------------

export interface AgentLearning {
  domain: string
  guidance: string
  evidence?: string
  source: string
  sourceRef: string
  confidence?: number
}

export interface TaskSpec {
  /** The text shown to the Brain as the task. */
  prompt: string
  /** The original mission goal, when supplied, otherwise the task prompt. */
  missionGoal?: string
  taskContext: Record<string, unknown>
  /** `taskContext` minus private fields, as echoed into the first Brain message. */
  publicTaskContext: Record<string, unknown>
  expectedArtifacts: string[]
  /** Concrete tool receipts required before finishing (the legacy `__external_action__` marker is excluded). */
  requiredActions: RequiredAction[]
  /** An actual external side-effect is required (explicit flag, or the legacy `__external_action__` marker). */
  requiresExternalAction: boolean
  agentLearnings: AgentLearning[]
  routingSessionId?: string
}

export function parseExpectedArtifacts(value: unknown): string[] {
  if (value === undefined) return []
  if (
    !Array.isArray(value)
    || value.length > 100
    || value.some((name) => typeof name !== 'string' || !name.trim())
  ) {
    throw new Error('Agent task expectedArtifacts must be an array of non-empty strings')
  }
  const names = value.map((name) => {
    if (typeof name !== 'string') {
      throw new Error('Agent task expectedArtifacts must be an array of non-empty strings')
    }
    return name.trim()
  })
  const deliverables = names.filter((name) => name.toLocaleLowerCase() !== 'system-action-receipts.json')
  if (new Set(deliverables.map((name) => name.toLocaleLowerCase())).size !== deliverables.length) {
    throw new Error('Agent task expectedArtifacts must be unique')
  }
  return deliverables
}

export function parseRequiredActions(value: unknown): RequiredAction[] {
  if (value === undefined) return []
  if (
    !Array.isArray(value)
    || value.length > 50
    || value.some((candidate) => {
      const action = asRecord(candidate)
      return !action
        || typeof action.toolId !== 'string'
        || !action.toolId.trim()
        || action.toolId.length > 120
        || !['success', 'failure', 'denied'].includes(String(action.outcome))
    })
  ) {
    throw new Error('Agent task requiredActions must contain valid tool IDs and expected outcomes')
  }
  return value.map((candidate) => {
    const action = candidate as Record<string, unknown>
    return { toolId: (action.toolId as string).trim(), outcome: action.outcome as AgentActionOutcome }
  })
}

function parseAgentLearnings(raw: unknown): AgentLearning[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 5).flatMap((value) => {
    const learning = asRecord(value)
    if (
      !learning
      || typeof learning.domain !== 'string'
      || typeof learning.guidance !== 'string'
      || typeof learning.source !== 'string'
      || typeof learning.sourceRef !== 'string'
    ) {
      return []
    }
    return [{
      domain: learning.domain,
      guidance: learning.guidance.slice(0, 1_000),
      evidence: typeof learning.evidence === 'string' ? learning.evidence.slice(0, 2_000) : undefined,
      source: learning.source,
      sourceRef: learning.sourceRef,
      confidence: typeof learning.confidence === 'number' ? learning.confidence : undefined,
    }]
  })
}

export function parseTaskSpec(taskInputValue: unknown): TaskSpec {
  const taskInput = asRecord(taskInputValue) || {}
  const taskContext = asRecord(taskInput.context) || {}
  const expectedArtifacts = parseExpectedArtifacts(taskContext.expectedArtifacts)
  const rawRequiredActions = parseRequiredActions(taskContext.requiredActions)
  const legacyExternalAction = rawRequiredActions.some((action) => action.toolId === '__external_action__')
  const requiredActions = rawRequiredActions.filter((action) => action.toolId !== '__external_action__')
  const requiresExternalAction = taskContext.requiresExternalAction === true || legacyExternalAction
  const prompt = typeof taskInput.prompt === 'string' ? taskInput.prompt : JSON.stringify(taskInput)
  const {
    agentLearnings: rawAgentLearnings,
    requiredActions: _unfilteredRequiredActions,
    missionGoal: _missionGoal,
    taskObjective: _taskObjective,
    ...publicTaskContextFields
  } = taskContext
  const publicTaskContext = {
    ...publicTaskContextFields,
    requiredActions,
    ...(requiresExternalAction ? { requiresExternalAction: true } : {}),
  }
  const routingSessionId = taskContext[BRAIN_ROUTING_SESSION_CONTEXT_KEY]
  return {
    prompt,
    missionGoal: typeof taskContext.missionGoal === 'string' && taskContext.missionGoal.trim()
      ? taskContext.missionGoal
      : typeof taskInput.prompt === 'string' ? taskInput.prompt : undefined,
    taskContext,
    publicTaskContext,
    expectedArtifacts,
    requiredActions,
    requiresExternalAction,
    agentLearnings: parseAgentLearnings(rawAgentLearnings),
    routingSessionId: typeof routingSessionId === 'string' && routingSessionId.trim()
      ? routingSessionId.trim()
      : undefined,
  }
}

// ---------------------------------------------------------------------------
// Completion checks
// ---------------------------------------------------------------------------

const NON_EXTERNAL_ACTION_TOOL_IDS = new Set([
  LIST_TOOLS_ACTION,
  CREATE_TOOL_ACTION,
  DELEGATE_ACTION,
])

export function missingRequiredActions(
  requiredActions: RequiredAction[],
  receipts: AgentActionReceipt[],
): RequiredAction[] {
  const remainingReceipts = [...receipts]
  return requiredActions.filter((required) => {
    const matchingIndex = remainingReceipts.findIndex((receipt) =>
      ((required.toolId === '__external_action__'
        ? ![LIST_TOOLS_ACTION, CREATE_TOOL_ACTION, DELEGATE_ACTION].includes(receipt.toolId)
        : receipt.toolId === required.toolId)
        || (receipt.toolId !== CREATE_TOOL_ACTION
          && required.outcome === 'success'
          && receipt.outcome === 'success'
          && receipt.fallbackForToolId === required.toolId))
      && receipt.outcome === required.outcome,
    )
    if (matchingIndex < 0) return true
    remainingReceipts.splice(matchingIndex, 1)
    return false
  })
}

export function hasExternalActionReceipt(receipts: AgentActionReceipt[], requiredActions: RequiredAction[] = []): boolean {
  const specific = requiredActions.filter((r) => r.toolId === '__external_action__' && r.outcome === 'success')
  if (specific.length > 0) return specific.every((r) => receipts.some((receipt) => receiptMatchesRequiredAction(receipt as any, r as any)))
  return receipts.some((receipt) =>
    receipt.outcome === 'success'
    && !receipt.isError
    && !NON_EXTERNAL_ACTION_TOOL_IDS.has(receipt.toolId)
    && receipt.toolId !== '__external_action__',
  )
}

export function missingExpectedArtifactSections(content: string, expected: string[]): string[] {
  if (expected.length === 0) return []
  const headings = [...content.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)]
    .filter((heading) => expected.some((name) => name.toLocaleLowerCase() === heading[1]?.trim().toLocaleLowerCase()))
  const sectionNames = new Set<string>()
  headings.forEach((heading, index) => {
    const name = heading[1]?.trim().toLocaleLowerCase()
    const start = (heading.index ?? 0) + heading[0].length
    const end = headings[index + 1]?.index ?? content.length
    if (name && content.slice(start, end).trim()) sectionNames.add(name)
  })
  return expected.filter((name) => !sectionNames.has(name.toLocaleLowerCase()))
}

export interface CompletionGaps {
  missingActions: RequiredAction[]
  missingExternalAction: boolean
  missingArtifacts: string[]
  /** The reply that failed assessment, when there is one. */
  lastReply?: string
  /** Nothing is missing: the output may be returned as the final answer. */
  complete: boolean
}

export function assessCompletion(
  spec: TaskSpec,
  output: string,
  receipts: AgentActionReceipt[],
  lastReply?: string,
): CompletionGaps {
  const missingActions = missingRequiredActions(spec.requiredActions, receipts)
  const missingExternalAction = spec.requiresExternalAction
    && !hasExternalActionReceipt(receipts as any, spec.requiredActions as any)
  const missingArtifacts = missingExpectedArtifactSections(output, spec.expectedArtifacts)
  return {
    missingActions,
    missingExternalAction,
    missingArtifacts,
    ...(lastReply !== undefined ? { lastReply } : {}),
    complete: missingActions.length === 0 && !missingExternalAction && missingArtifacts.length === 0,
  }
}

// ---------------------------------------------------------------------------
// Correction messages shown to the Brain
// ---------------------------------------------------------------------------

export function requiredActionCorrection(
  actions: RequiredAction[],
  requiresExternalAction = false,
): string {
  const pending = actions.map((action) => `${action.toolId} (${action.outcome})`)
  const parts = [
    ...(pending.length > 0 ? [`Still required: ${pending.join(', ')}.`] : []),
    ...(requiresExternalAction ? [`A verified external operation has not been performed. Discovery, tool creation, delegation and drafting do not count. If a registered tool can perform the operation, call it now with the task's actual values. If no registered tool matches, call ${CREATE_TOOL_ACTION} to create one — do not return a text answer without attempting a tool or tool creation.`] : []),
  ]
  return `${parts.join(' ')} Reply with the single next JSON action that makes progress.`
}

export function expectedArtifactCorrection(missing: string[], missionGoal?: string): string {
  const headings = missing.map((name) => `## ${name}`).join(', ')
  const goalReminder = missionGoal?.trim()
    ? ` The content under each heading must directly satisfy the original mission/task goal: ${missionGoal.trim().slice(0, 400)}`
    : ''
  return `Your response is missing required deliverable section(s): ${headings}. Return the complete corrected response using a Markdown heading exactly matching each name on its own line (for example, ${missing[0] ? `\`## ${missing[0]}\`` : '`## artifact-name`'}) followed by that deliverable's verified content. Do not put the required heading inside a code fence.${goalReminder} Only include verified results; if a result cannot be produced, state the specific blocker under that heading instead of inventing content.`
}

/**
 * Well-known deliverable file names the planner sometimes uses as artifact ids, mapped to
 * the file each one must become. Used so the correction tells the Brain exactly what to write.
 */
export const FILE_NAME_ALIASES = new Map<string, string>([
  ['html_file', 'index.html'],
  ['html', 'index.html'],
  ['css_file', 'styles.css'],
  ['css', 'styles.css'],
  ['javascript_file', 'script.js'],
  ['js_file', 'script.js'],
  ['javascript', 'script.js'],
])

/** The filename or path the content of an artifact should be written to. */
export function deliverableFileName(name: string): string {
  const trimmed = name.trim()
  const alias = FILE_NAME_ALIASES.get(trimmed.toLocaleLowerCase())
  if (alias) return alias
  return /^[^\s/]+\.[a-z0-9]{1,8}$/i.test(trimmed) ? trimmed : `${trimmed.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`
}

export interface CorrectionContext {
  /** How many corrections this run already issued for the same gap. */
  attempts?: number
  /** Artifact names with their canonical file names, for example `html_file (index.html)`. */
  expectedArtifacts?: string[]
  /** The reply that failed assessment. */
  previousAnswer?: string
}

/**
 * The way to produce one deliverable, escalating with each failed correction attempt so a
 * retry is never a repeat of the same request:
 *  1. include the section in the answer;
 *  2. write the complete file with the file tool, then confirm each artifact;
 *  3. write only the section that is still missing.
 */
export function deliverableEscalation(
  missing: string[],
  context: CorrectionContext = {},
): string[] {
  const attempts = context.attempts ?? 1
  const names = missing.map((name) => {
    const canonical = context.expectedArtifacts?.find((candidate) =>
      candidate === name || candidate.startsWith(`${name} (`))
    return canonical ?? `${name} (${deliverableFileName(name)})`
  })
  const previous = context.previousAnswer?.trim()
  const previousNote = previous
    ? ` Your previous reply started with: "${previous.slice(0, 300)}${previous.length > 300 ? '...' : ''}" and was not a valid final answer, so it was not accepted.`
    : ''
  if (attempts <= 1) {
    return [
      `Attempt 1 of 3 — put each missing deliverable in this answer. After the last tool action, return ONLY the final answer: no tool JSON, no plans, no next steps.`,
    ]
  }
  if (attempts === 2) {
    return [
      `Attempt 2 of 3 — a different method. Do not only restate the answer: write each missing deliverable as a complete file with the file tool ({ "tool": "file_ops", "args": { "operation": "write", "path": "<file name>", "content": "<complete file content>" } }), then end with one line confirming each deliverable (file name and what it contains).`,
      `Required deliverables: ${names.join('; ')}.`,
      previousNote,
    ]
  }
  return [
    `Attempt 3 of 3 — produce only what is still missing, one deliverable per reply. Do not repeat deliverables that already have content. For ${names.join('; ')} return the complete content under its exact heading (\`## <artifact name>\`) or write the file with the file tool.`,
    previousNote,
  ]
}

/** The single user message that corrects every gap in `gaps`. */
export function composeCorrection(
  gaps: CompletionGaps,
  missionGoal?: string,
  context: CorrectionContext = {},
): string {
  const artifactCorrection = gaps.missingArtifacts.length > 0
    ? [expectedArtifactCorrection(gaps.missingArtifacts, missionGoal), ...deliverableEscalation(gaps.missingArtifacts, context)]
    : []
  return [
    ...(gaps.missingActions.length > 0 || gaps.missingExternalAction
      ? [requiredActionCorrection(gaps.missingActions, gaps.missingExternalAction)]
      : []),
    ...artifactCorrection,
  ].join('\n\n')
}
