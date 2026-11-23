import {
  ASK_USER_MARKER,
  CREATE_TOOL_ACTION,
  DELEGATE_ACTION,
  LIST_TOOLS_ACTION,
  MAX_ASK_USER_QUESTION_LENGTH,
  isAskUserTool,
} from './constants'

// Transcript scaffolding the model sometimes echoes back after its question.
// These are internal prompt markers, never part of a real user-facing question.
const TRANSCRIPT_TAG_PATTERN = /<\/?(?:your_previous_reply|system_feedback|task)>/gi;

export const CAPABILITY_RESOLUTION_GUIDANCE =
  'Do not ask the user to choose a provider or provide tool credentials before checking available integrations. Re-read the mission, inspect the live catalog, and use __create_tool to resolve the capability so configured integrations and credentials can be used. Ask only for a specific missing value or an actual authorization or service decision.'

export const AUTONOMY_GUIDANCE =
  'You are responsible for getting the task complete. Before asking the user anything, determine whether the question is genuinely something only the user can answer or an abdication of your responsibility. Resolve preferences, choices, tool setup, diagnosis, and deliverable production yourself from mission context, available evidence, and reasonable assumptions; state those assumptions. Ask only for an essential fact or explicit authorization that cannot be inferred.'

export const REPEATED_QUESTION_GUIDANCE =
  'You already asked this question and received a response. Do not repeat or rephrase the same question. Interpret the response in the context of the original question, make a reasonable assumption or delegated decision when possible, and proceed. Ask a follow-up only for a specific essential fact that remains unresolved, explaining what is still missing.'

export const DELIVERABLE_GUIDANCE =
  'Do not ask the user to create the assigned deliverable. Produce it yourself from the mission context and available evidence. Ask only for a specific necessary non-secret fact, decision, or permission that is unavailable.'

const QUESTION_STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'can', 'category', 'could',
  'do', 'does', 'for', 'from', 'have', 'how', 'i', 'in', 'interested', 'is', 'it',
  'kind', 'like', 'me', 'of', 'on', 'option', 'or', 'other', 'others', 'please',
  'prefer', 'provide', 'question', 'should', 'specific', 'such', 'tell', 'that',
  'the', 'there', 'these', 'this', 'those', 'to', 'type', 'want', 'we', 'what',
  'which', 'who', 'why', 'with', 'would', 'you', 'your',
])

function questionTerms(question: string): Set<string> {
  return new Set(
    question.toLocaleLowerCase().split(/[^a-z0-9]+/)
      .filter((term) => term.length > 2 && !QUESTION_STOP_WORDS.has(term)),
  )
}

export function asksUserToRepeatQuestion(question: string, previousQuestion: unknown): boolean {
  if (typeof previousQuestion !== 'string' || !previousQuestion.trim()) return false
  const previous = previousQuestion.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const current = question.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (previous === current) return true

  const previousTerms = questionTerms(previous)
  const currentTerms = questionTerms(current)
  if (previousTerms.size === 0 || currentTerms.size === 0) return false
  const overlap = [...previousTerms].filter((term) => currentTerms.has(term)).length
  const unionSize = previousTerms.size + currentTerms.size - overlap
  return overlap >= 2 && overlap / unionSize >= 0.8
}

export function asksUserForRawCredential(question: string): boolean {
  return /\b(?:api[\s_-]*keys?|tokens?|passwords?|passphrases?|credentials?|secrets?|private[\s_-]*keys?|authorization(?:\s+headers?)?)\b/i.test(question)
}

export function hasTriedToolAfterResolution(toolIds: readonly string[]): boolean {
  const lastResolutionIndex = toolIds.lastIndexOf(CREATE_TOOL_ACTION)
  return lastResolutionIndex >= 0 && toolIds.slice(lastResolutionIndex + 1).some(
    (toolId) => !isAskUserTool(toolId) && ![CREATE_TOOL_ACTION, DELEGATE_ACTION, LIST_TOOLS_ACTION].includes(toolId),
  )
}

const VAGUE_QUESTION_PATTERNS = [
  /^i need more information\b/i,
  /^please provide the missing value\b/i,
  /^provide the missing value\b/i,
  /^i need (?:some|more|additional) (?:info|information|details?)\b/i,
  /^please (?:give|provide|supply|enter) (?:me )?(?:the )?(?:missing|required) (?:value|input|information)\b/i,
  /^what (?:value|input|information) (?:do you want|is needed|is required)\b/i,
  /^which (?:value|input|field) (?:should i use|is needed)\b/i,
  /^missing (?:value|input|field)\b/i,
]

export function isVagueQuestion(question: string): boolean {
  const normalized = question.trim().toLowerCase()
  return VAGUE_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))
}

// Models sometimes echo the system instructions or their own reasoning after the marker.
// Return only a genuine, concise question, or undefined when none can be recovered.
export function extractAskUserQuestion(content: string): string | undefined {
  let from = 0
  for (;;) {
    const idx = content.indexOf(ASK_USER_MARKER, from)
    if (idx < 0) return undefined
    from = idx + ASK_USER_MARKER.length
    let candidate = content.slice(from)
    const cut = candidate.search(/\n\s*\n|\n\s*(?:Agent|System|User|Assistant)\s*:|\[action_receipt|\n\s*(?:```|\{)|<\/?(?:your_previous_reply|system_feedback|task)>/i)
    if (cut >= 0) candidate = candidate.slice(0, cut)
    candidate = candidate.replace(TRANSCRIPT_TAG_PATTERN, ' ').replace(/\s+/g, ' ').trim()
    if (candidate.startsWith('{')) return `${ASK_USER_MARKER}${content.slice(from).trim()}`
    if (candidate.length < 8 || /^followed by\b|^<question>|\bmark secret values with\b|\bDo not emit JSON\b/i.test(candidate)) continue
    if (candidate.length > MAX_ASK_USER_QUESTION_LENGTH) {
      const sentenceEnd = candidate.slice(0, MAX_ASK_USER_QUESTION_LENGTH).search(/[?.!](?!.*[?.!])/)
      candidate = sentenceEnd > 0 ? candidate.slice(0, sentenceEnd + 1) : `${candidate.slice(0, MAX_ASK_USER_QUESTION_LENGTH - 1)}…`
    }
    return `${ASK_USER_MARKER}${candidate}`
  }
}
