import type { BrainClient } from './BrainClient'
import {
  asksUserToRepeatQuestion,
  extractAskUserQuestion,
  isVagueQuestion,
  REPEATED_QUESTION_GUIDANCE,
} from './askUser'
import { containsToolAction, interpretReply } from './actionParser'
import { ASK_USER_MARKER, MAX_ARTIFACT_CORRECTION_ATTEMPTS } from './constants'
import { assessCompletion, composeCorrection, FILE_NAME_ALIASES, type CompletionGaps } from './requirements'
import { NEXT_TURN, STOP_LOOP, returnWith, type RunContext, type TurnEnd } from './RunContext'
import type { AgentExecutionResult, BrainReply } from './types'

function artifactBlocker(missingArtifacts: string[]): string {
  return `Could not produce required deliverable section(s) in the expected format after ${MAX_ARTIFACT_CORRECTION_ATTEMPTS} correction attempts: ${missingArtifacts.join(', ')}.`
}

/** `spec.expectedArtifacts` with canonical aliases (html_file -> index.html) where they do not collide. */
function artifactNamesForRendering(expected: string[]): string[] {
  const taken = new Set(expected.map((name) => name.trim().toLocaleLowerCase()))
  return expected.map((name) => {
    const alias = FILE_NAME_ALIASES.get(name.trim().toLocaleLowerCase())
    if (!alias || taken.has(alias)) return name
    taken.add(alias)
    return `${name} (${alias})`
  })
}

/**
 * Deterministic per-artifact sections for a reply that is (valid) structured data but
 * not the required Markdown answer. Each artifact keeps its complete content; each
 * section starts with a summary paragraph, as the task contract requires.
 */
function renderStructuredArtifacts(artifacts: Record<string, unknown>): string {
  return Object.entries(artifacts)
    .flatMap(([name, value]) => {
      const body = typeof value === 'string' ? value.trim() : JSON.stringify(value, null, 2).trim()
      if (!body) return []
      return [`## ${name}\n${summarizeDeliverable(name, body)}\n\n\`\`\`\n${body}\n\`\`\``]
    })
    .join('\n\n')
}

function summarizeDeliverable(name: string, body: string): string {
  const heading = body.match(/^#{1,6}[ \t]+(.+)$/m)?.[1]?.trim()
  const firstLines = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}[ \t]+.*$/gm, ' ')
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .find(Boolean) || ''
  const subject = heading || name
  const summary = firstLines.length > 280 ? `${firstLines.slice(0, 277)}...` : firstLines
  return summary ? `Summary: ${subject} — ${summary}` : `Summary: complete content for ${subject}.`
}

/**
 * Recovers a deliverable answer the Brain expressed as structured data. Only a reply that
 * carries the expected artifacts (or nothing that looks like internal agent transport) is
 * rendered; manifests, plans and receipts are never turned into deliverables.
 */
function adoptStructuredArtifacts(content: string, expected: string[]): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content.trim())
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  if (typeof record.tool === 'string' || Array.isArray(record.phases) || Array.isArray(record.actionReceipts)) return undefined
  const expectedLower = new Map(expected.map((name) => [name.trim().toLocaleLowerCase(), name]))
  const artifacts: Record<string, unknown> = {}
  const canonicalName = (key: string): string | undefined => {
    const lower = key.trim().toLocaleLowerCase()
    if (expectedLower.has(lower)) return expectedLower.get(lower)
    const known = FILE_NAME_ALIASES.get(lower)
    if (known && expectedLower.has(known)) return expectedLower.get(known)
    // "pricing_model" answers the deliverable "pricing_model.md".
    const withoutExtension = lower.replace(/\.[a-z0-9]{1,8}$/, '')
    const match = expected.find((name) => name.trim().toLocaleLowerCase().replace(/\.[a-z0-9]{1,8}$/, '') === withoutExtension)
    return match
  }
  for (const [key, value] of Object.entries(record)) {
    const canonical = canonicalName(key)
    if (canonical) artifacts[canonical] = value
  }
  const nested = record.artifacts ?? record.deliverables
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
      const canonical = canonicalName(key)
      if (canonical && artifacts[canonical] === undefined) artifacts[canonical] = value
    }
  }
  return Object.keys(artifacts).length > 0 ? renderStructuredArtifacts(artifacts) : undefined
}

/** Tells the Brain which parts of its answer failed validation. `subject` is how the answer is named in the complaint. */
async function reportCompletionGaps(
  brain: BrainClient,
  requestId: string | undefined,
  gaps: CompletionGaps,
  subject: 'final output' | 'output',
  missionId: string,
): Promise<void> {
  if (gaps.missingActions.length > 0) {
    await brain.reportComplaint(
      requestId,
      `Agent response validation failed: missing required action receipt(s): ${gaps.missingActions.map((action) => `${action.toolId}:${action.outcome}`).join(', ')}.`,
      missionId,
    )
  }
  if (gaps.missingExternalAction) {
    await brain.reportComplaint(
      requestId,
      'Agent response validation failed: no successful external-operation receipt was recorded.',
      missionId,
    )
  }
  if (gaps.missingArtifacts.length > 0) {
    const brainFormatting = interpretReply(gaps.lastReply ?? '') !== undefined
    await brain.reportComplaint(
      requestId,
      brainFormatting
        ? `Agent response validation failed: the reply was a tool action instead of the final answer, so required deliverable section(s) were omitted: ${gaps.missingArtifacts.join(', ')}.`
        : `Agent response validation failed: ${subject} omitted required artifact section(s): ${gaps.missingArtifacts.join(', ')}.`,
      missionId,
    )
  }
}

/**
 * A checkpoint that already holds a final answer is re-checked against the task
 * contract. Returns a result when the answer can be returned as-is; otherwise queues a
 * correction and returns `undefined` so the loop can ask the Brain for a better one.
 */
export async function replayFinishedCheckpoint(rc: RunContext): Promise<AgentExecutionResult | undefined> {
  const { state, spec, deps, context } = rc
  const finalOutput = state.finalOutput
  if (finalOutput === undefined) return undefined

  if (state.incompleteReason) {
    return state.result(finalOutput, { incompleteReason: state.incompleteReason })
  }
  if (containsToolAction(finalOutput)) {
    await deps.brain.reportComplaint(state.lastRequestId, 'Agent response validation failed: checkpoint contains an unexecuted tool-action-shaped response.', context.missionId)
    state.tell('The previous response described a tool action but was not executed. Return exactly one raw JSON action with "tool" and "args", or a verified final answer. Do not claim that the proposed action succeeded.')
    state.finalOutput = undefined
    await state.save()
    return undefined
  }
  const gaps = assessCompletion(spec, finalOutput, state.actionReceipts)
  if (gaps.complete) return state.result(finalOutput, { reasoning: undefined })

  await reportCompletionGaps(deps.brain, state.lastRequestId, gaps, 'final output', context.missionId)
  // Carried over unchanged: `artifactCorrectionAttempts` starts at 0 for a resumed run, so the
  // limit below can only trigger if a future change raises the starting value.
  state.artifactCorrectionAttempts++
  if (gaps.missingArtifacts.length > 0 && state.artifactCorrectionAttempts > MAX_ARTIFACT_CORRECTION_ATTEMPTS) {
    const blocker = artifactBlocker(gaps.missingArtifacts)
    return state.result(finalOutput || blocker, { incompleteReason: blocker })
  }
  // Drop the invalid final response before retrying so corrections don't accumulate prior bad outputs.
  if (gaps.missingArtifacts.length > 0 && state.history[state.history.length - 1]?.role === 'assistant') {
    state.history = state.history.slice(0, -1)
  }
  state.tell(composeCorrection(gaps, spec.missionGoal))
  state.finalOutput = undefined
  return undefined
}

/**
 * The Brain replied with something that is not an executable action: an
 * `__ASK_USER__` question, a malformed action, or a candidate final answer.
 */
export async function handleReplyWithoutAction(rc: RunContext, reply: BrainReply): Promise<TurnEnd> {
  if (reply.content.includes(ASK_USER_MARKER)) return handleAskUserReply(rc, reply)
  if (containsToolAction(reply.content)) return rejectMalformedAction(rc, reply)
  return checkFinalAnswer(rc, reply)
}

async function handleAskUserReply(rc: RunContext, { content, reasoning }: BrainReply): Promise<TurnEnd> {
  const { state, spec } = rc
  const relevant = extractAskUserQuestion(content)
  if (!relevant) {
    state.tell(`Your response contained no usable question. If you are blocked, reply with exactly one line: ${ASK_USER_MARKER} <your question about one specific missing value>. Otherwise continue the task with a single JSON action. Do not repeat instructions or write your own receipts.`)
    await state.save()
    return NEXT_TURN
  }
  let question = relevant.slice(ASK_USER_MARKER.length)
  if (question.startsWith('{')) {
    try {
      const payload: unknown = JSON.parse(question)
      if (payload && typeof payload === 'object' && 'question' in payload && typeof payload.question === 'string') {
        question = payload.question
      }
    } catch {
      // The interruption parser reports malformed structured requests.
    }
  }
  if (isVagueQuestion(question)) {
    state.tell(`Your question is too vague. You must name the exact missing factual value or authorization and why it is required. Bad: "Please provide the missing value." Good: "Please provide the recipient's email address so I can send the report."`)
    await state.save()
    return NEXT_TURN
  }
  if (asksUserToRepeatQuestion(question, spec.taskContext.priorUserQuestion)) {

    const previousResponse = typeof spec.taskContext.priorUserResponse === 'string'
      ? `\nThe user's response was: ${spec.taskContext.priorUserResponse}`
      : ''
    // The user already answered this question. Do not loop by returning NEXT_TURN
    // (which hands the Brain another turn to ask again). Stop the loop with a
    // clear finalOutput so the orchestrator can proceed without re-asking.
    if (previousResponse) {
      state.finalOutput = `The user already answered this question: "${spec.taskContext.priorUserResponse}". Do not ask again; proceed with the authorized action or report the blocker.`
      await state.save()
      return STOP_LOOP
    }
    state.tell(`${REPEATED_QUESTION_GUIDANCE}\nThe question already asked was: ${spec.taskContext.priorUserQuestion}${previousResponse}`)
    await state.save()
    return NEXT_TURN
  }
  await state.save()
  return returnWith(state.result(relevant, { reasoning }))
}

async function rejectMalformedAction(rc: RunContext, { completion }: BrainReply): Promise<TurnEnd> {
  const { state, deps, context } = rc
  const correction = 'Your response included a tool-action object, but it was not the sole valid action response and was not executed. To execute an action, return exactly one raw JSON object in the form {"tool":"<tool-id>","args":{...}} with no surrounding prose, Markdown fence, or nesting. Otherwise return plain text if the task is complete. Never describe or claim an action that was not executed.'
  await deps.brain.reportComplaint(
    completion.requestId,
    'Agent response validation failed: tool-action-shaped content was not a single valid executable action.',
    context.missionId,
  )
  state.tell(`${correction} No proposed action in the previous response was executed. Select the next single action needed for the original task and return only that action; after receiving its result, continue with the remaining work.`)
  await state.save()
  return NEXT_TURN
}

/** Accepts the reply as the final answer, or asks the Brain to fix what is missing from it. */
async function checkFinalAnswer(rc: RunContext, { completion, content, reasoning }: BrainReply): Promise<TurnEnd> {
  const { state, spec, deps, context } = rc
  const gaps = assessCompletion(spec, content, state.actionReceipts, content)
  if (gaps.complete) {
    state.artifactCorrectionAttempts = 0
    state.finalOutput = content
    await state.save()
    return returnWith(state.result(content, { reasoning }))
  }

  await reportCompletionGaps(deps.brain, completion.requestId, gaps, 'output', context.missionId)
  state.artifactCorrectionAttempts++
  const onlyArtifactsMissing = gaps.missingArtifacts.length > 0
    && gaps.missingActions.length === 0
    && !gaps.missingExternalAction
  if (onlyArtifactsMissing && state.artifactCorrectionAttempts > MAX_ARTIFACT_CORRECTION_ATTEMPTS) {
    const blocker = artifactBlocker(gaps.missingArtifacts)
    state.finalOutput = content
    state.incompleteReason = blocker
    await state.save()
    return returnWith(state.result(content, { incompleteReason: blocker, reasoning }))
  }
  // For artifact-only format corrections, drop the invalid assistant response to avoid
  // prompt bloat and prevent the model from copying its previous malformed output.
  if (onlyArtifactsMissing) state.history = state.history.slice(0, -1)
  // Structured data that carries the deliverables is rendered into the required sections
  // instead of being lost; anything else still gets an escalating correction.
  const adopted = adoptStructuredArtifacts(content, spec.expectedArtifacts)
  if (adopted) {
    const adoptedGaps = assessCompletion(spec, adopted, state.actionReceipts)
    if (adoptedGaps.complete) {
      state.artifactCorrectionAttempts = 0
      state.finalOutput = adopted
      await state.save()
      return returnWith(state.result(adopted, { reasoning }))
    }
  }
  state.tell(composeCorrection(gaps, spec.missionGoal, {
    attempts: state.artifactCorrectionAttempts,
    expectedArtifacts: artifactNamesForRendering(spec.expectedArtifacts),
    previousAnswer: content,
  }))
  await state.save()
  return NEXT_TURN
}
