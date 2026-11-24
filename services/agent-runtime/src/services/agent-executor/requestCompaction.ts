import { ASK_USER_MARKER, MAX_BRAIN_REQUEST_BYTES } from './constants'
import { renderBrainTranscript } from './prompt'
import type { ChatMessage } from './types'
import { truncateMiddle } from './util'

export interface BrainRequestIrreducibleParts {
  systemPromptBytes: number
  transcriptBytes: number
  preservedMessageIndexes: number[]
  requestBytes: number
  limitBytes: number
}

export class BrainRequestIrreducibleError extends Error {
  readonly code = 'BRAIN_REQUEST_IRREDUCIBLE'
  readonly irreducible: BrainRequestIrreducibleParts

  constructor(message: string, irreducible: BrainRequestIrreducibleParts) {
    super(message)
    this.name = 'BrainRequestIrreducibleError'
    this.irreducible = irreducible
  }
}

const DEFAULT_MESSAGE_CHAR_CAP = 24_000
const MIN_MESSAGE_CHAR_CAP = 400
const MIN_SYSTEM_PROMPT_CHARS = 400
const MIN_REQUIRED_MESSAGE_CHARS = 120
const MIN_TRANSCRIPT_SUFFIX = '\n\nWrite only your next reply: one JSON action, or your final answer.'
const SHORT_SUFFIX = '\n\nReply with one JSON action or final answer.'

const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8')

const buildRequestBody = (
  systemPrompt: string,
  history: ChatMessage[],
  base: Record<string, unknown>,
  transcriptSuffix?: string,
): string =>
  JSON.stringify({
    ...base,
    prompt: transcriptSuffix === undefined
      ? renderBrainTranscript(history)
      : renderBrainTranscriptWithSuffix(history, transcriptSuffix),
    systemPrompt,
  })

function renderBrainTranscriptWithSuffix(history: ChatMessage[], suffix: string): string {
  const turns = history.map((message, index) => {
    if (index === 0 && message.role === 'user') return `<task>\n${message.content}\n</task>`
    return message.role === 'assistant'
      ? `<your_previous_reply>\n${message.content}\n</your_previous_reply>`
      : `<system_feedback>\n${message.content}\n</system_feedback>`
  })
  return `${turns.join('\n\n')}${suffix}`
}

function isPendingOrCredentialContent(content: string): boolean {
  return content.includes(ASK_USER_MARKER)
    || /credentialRequest|permission_required|question_asked/i.test(content)
    || /Please provide .+ in the secure form/i.test(content)
    || /\[secret:[^\]]+\]/i.test(content)
}

function isActionResultContent(content: string): boolean {
  return /^Action result:/i.test(content) || /^Action failed:/i.test(content)
}

function isLatestUserReply(message: ChatMessage, index: number, history: ChatMessage[]): boolean {
  if (message.role !== 'user') return false
  if (isActionResultContent(message.content)) return false
  if (isPendingOrCredentialContent(message.content)) return false
  if (/^Retry guidance for this resumed task:/i.test(message.content)) return false
  let lastPlain = -1
  for (let i = 1; i < history.length; i++) {
    const m = history[i]!
    if (m.role === 'user' && !isActionResultContent(m.content) && !isPendingOrCredentialContent(m.content) && !/^Retry guidance for this resumed task:/i.test(m.content)) {
      lastPlain = i
    }
  }
  return index === lastPlain || index >= Math.max(1, history.length - 2)
}

function requiredIndexes(history: ChatMessage[]): Set<number> {
  const required = new Set<number>()
  if (history.length > 0) required.add(0)
  let lastActionResult = -1
  for (let i = 1; i < history.length; i++) {
    const m = history[i]!
    if (isPendingOrCredentialContent(m.content)) required.add(i)
    if (isActionResultContent(m.content)) lastActionResult = i
    if (isLatestUserReply(m, i, history)) required.add(i)
  }
  if (lastActionResult >= 0) required.add(lastActionResult)
  for (let i = history.length - 1; i >= 1; i--) {
    if (history[i]!.role === 'assistant') { required.add(i); break }
  }
  if (history.length > 1) required.add(history.length - 1)
  return required
}

function cloneHistory(history: ChatMessage[]): ChatMessage[] {
  return history.map((message) => ({ ...message }))
}

function capMessageContents(history: ChatMessage[], cap: number, protectedSet?: Set<number>, protectedCap?: number): ChatMessage[] {
  return history.map((message, index) => {
    const effectiveCap = protectedSet?.has(index) ? Math.max(cap, protectedCap ?? cap) : cap
    if (message.content.length <= effectiveCap) return message
    const label = index === 0 ? 'Task context' : (message.role === 'assistant' ? 'Assistant message' : 'System feedback')
    return { ...message, content: truncateMiddle(message.content, effectiveCap, label) }
  })
}

function placeholderFor(messages: ChatMessage[]): string {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  const totalBytes = messages.reduce((sum, m) => sum + byteLength(m.content), 0)
  return `[Earlier context compacted: ${messages.length} message(s), ${totalChars} chars / ${totalBytes} bytes omitted to fit the request limit.]`
}

function compactDroppingOptional(history: ChatMessage[], required: Set<number>, keepOptionalTail: number): ChatMessage[] {
  if (history.length <= 2) return history
  const optionalIndexes = history.map((_, i) => i).filter((i) => !required.has(i))
  const keepTail = new Set(optionalIndexes.slice(Math.max(0, optionalIndexes.length - keepOptionalTail)))
  const omitted: ChatMessage[] = []
  for (let i = 0; i < history.length; i++) {
    if (!(required.has(i) || keepTail.has(i))) omitted.push(history[i]!)
  }
  if (omitted.length === 0) return history.filter((_, i) => required.has(i) || keepTail.has(i))
  const result: ChatMessage[] = []
  let inserted = false
  for (let i = 0; i < history.length; i++) {
    if (required.has(i) || keepTail.has(i)) result.push(history[i]!)
    else if (!inserted) {
      result.push({ role: 'user', content: placeholderFor(omitted) })
      inserted = true
    }
  }
  return result.length ? result : [history[0]!]
}

function shrinkTextToBytes(text: string, targetBytes: number, label: string, minChars: number): string {
  if (byteLength(text) <= targetBytes) return text
  let cap = Math.max(minChars, Math.min(text.length, Math.floor(targetBytes / 2) + minChars))
  let shrunk = truncateMiddle(text, cap, label)
  for (let i = 0; i < 10 && byteLength(shrunk) > targetBytes && cap > minChars; i++) {
    cap = Math.max(minChars, Math.floor(cap * 0.7))
    shrunk = truncateMiddle(text, cap, label)
  }
  if (byteLength(shrunk) > targetBytes) {
    let lo = minChars
    let hi = Math.min(text.length, targetBytes)
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      const candidate = truncateMiddle(text, mid, label)
      if (byteLength(candidate) <= targetBytes) lo = mid
      else hi = mid - 1
    }
    shrunk = truncateMiddle(text, Math.max(minChars, lo), label)
  }
  if (byteLength(shrunk) > targetBytes) {
    const buf = Buffer.from(text, 'utf8')
    const marker = Buffer.from(`\n[${label} truncated]\n`, 'utf8')
    const keep = Math.max(0, targetBytes - marker.length)
    const headLen = Math.ceil(keep / 2)
    const tailLen = keep - headLen
    shrunk = Buffer.concat([buf.subarray(0, headLen), marker, buf.subarray(Math.max(0, buf.length - tailLen))]).toString('utf8')
  }
  return shrunk
}

export function compactBrainRequest(input: {
  systemPrompt: string
  history: ChatMessage[]
  base: Record<string, unknown>
  maxBytes?: number
}): { requestBody: string; systemPrompt: string; history: ChatMessage[] } {
  const maxBytes = input.maxBytes ?? MAX_BRAIN_REQUEST_BYTES
  let systemPrompt = input.systemPrompt
  let history = cloneHistory(input.history.length ? input.history : [{ role: 'user', content: '[task context unavailable]' }])
  let req = requiredIndexes(history)

  const tryBuild = (sp: string, h: ChatMessage[], suffix?: string) => {
    const body = buildRequestBody(sp, h, input.base, suffix)
    return { body, bytes: byteLength(body) }
  }

  let attempt = tryBuild(systemPrompt, history)
  if (attempt.bytes <= maxBytes) return { requestBody: attempt.body, systemPrompt, history }

  // Prefer dropping old optional turns to truncating the task or recent evidence.
  for (const keepOptional of [8, 4, 2, 1, 0]) {
    const candidate = compactDroppingOptional(history, req, keepOptional)
    attempt = tryBuild(systemPrompt, candidate)
    if (attempt.bytes <= maxBytes) return { requestBody: attempt.body, systemPrompt, history: candidate }
  }

  // 1) cap individual messages (preserve more for required messages early)
  for (const cap of [DEFAULT_MESSAGE_CHAR_CAP, 12_000, 8_000, 4_000, 2_000, 1200, MIN_MESSAGE_CHAR_CAP]) {
    history = capMessageContents(history, cap, req, Math.max(cap, 1500))
    attempt = tryBuild(systemPrompt, history)
    if (attempt.bytes <= maxBytes) return { requestBody: attempt.body, systemPrompt, history }
  }

  // 2) drop optional middle turns/placeholders, preserve required
  let compactedHistory = history
  for (const keepOptional of [8, 4, 2, 1, 0]) {
    let h = compactDroppingOptional(history, req, keepOptional)
    const candidateRequired = requiredIndexes(h)
    for (const cap of [4_000, 2_000, 1200, MIN_MESSAGE_CHAR_CAP]) {
      h = capMessageContents(h, cap, candidateRequired, Math.max(cap, 1200))
      attempt = tryBuild(systemPrompt, h)
      if (attempt.bytes <= maxBytes) return { requestBody: attempt.body, systemPrompt, history: h }
    }
    compactedHistory = h
  }
  history = compactedHistory
  req = requiredIndexes(history)

  // 3) trim system prompt/transcript scaffolding
  for (const suffix of [MIN_TRANSCRIPT_SUFFIX, SHORT_SUFFIX, '\n\nReply.']) {
    for (const spTarget of [24_000, 12_000, 8_000, 4_000, 2_000, 1200, MIN_SYSTEM_PROMPT_CHARS]) {
      systemPrompt = shrinkTextToBytes(input.systemPrompt, spTarget, 'System prompt', MIN_SYSTEM_PROMPT_CHARS)
      history = capMessageContents(history, 800, req, 1200)
      attempt = tryBuild(systemPrompt, history, suffix)
      if (attempt.bytes <= maxBytes) return { requestBody: attempt.body, systemPrompt, history }
    }
  }

  // 4) best-effort shrink of required fields down to floor (never throw while shrinkable above floor logic except true irreducible)
  const preservedOnly = history.filter((_, i) => req.has(i))
  history = preservedOnly.length ? preservedOnly : [history[0]!]
  const preservedReq = new Set(history.map((_, i) => i)) // all preserved now required
  for (const spTarget of [4_000, 2_000, 1200, 600, 300, 160]) {
    systemPrompt = shrinkTextToBytes(input.systemPrompt, spTarget, 'System prompt', 120)
    for (const msgCap of [1200, 800, 500, 300, MIN_REQUIRED_MESSAGE_CHARS]) {
      history = capMessageContents(history, msgCap, preservedReq, msgCap)
      attempt = tryBuild(systemPrompt, history, '\n\nReply.')
      if (attempt.bytes <= maxBytes) return { requestBody: attempt.body, systemPrompt, history }
    }
  }

  const baseBytes = byteLength(JSON.stringify({ ...input.base, prompt: '', systemPrompt: '' })) + byteLength('\n\nReply.')
  const available = maxBytes - baseBytes - 64
  if (available > 0) {
    systemPrompt = shrinkTextToBytes(systemPrompt, Math.max(80, Math.floor(available * 0.3)), 'System prompt', 80)
    let remaining = Math.max(0, available - byteLength(systemPrompt))
    const per = Math.max(60, Math.floor(remaining / Math.max(1, history.length)))
    history = history.map((m, idx) => ({ ...m, content: shrinkTextToBytes(m.content, per, idx === 0 ? 'Task context' : 'Context', 60) }))
    attempt = tryBuild(systemPrompt, history, '\n\nReply.')
    if (attempt.bytes <= maxBytes) return { requestBody: attempt.body, systemPrompt, history }
  }

  const irreducible: BrainRequestIrreducibleParts = {
    systemPromptBytes: byteLength(systemPrompt),
    transcriptBytes: byteLength(renderBrainTranscriptWithSuffix(history, '\n\nReply.')),
    preservedMessageIndexes: history.map((_, i) => i),
    requestBytes: attempt.bytes,
    limitBytes: maxBytes,
  }
  throw new BrainRequestIrreducibleError(
    `Brain request cannot be reduced below ${maxBytes} bytes: irreducible preserved context (system prompt ${irreducible.systemPromptBytes} bytes; ${history.length} required message(s), transcript ${irreducible.transcriptBytes} bytes; request ${irreducible.requestBytes} bytes). Reduce task goal, required inputs, latest action result, or request metadata.`,
    irreducible,
  )
}
