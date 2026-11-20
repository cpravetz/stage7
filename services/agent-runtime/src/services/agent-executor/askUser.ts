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

export const DELIVERABLE_GUIDANCE =
  'Do not ask the user to create the assigned deliverable. Produce it yourself from the mission context and available evidence. Ask only for a specific necessary fact, decision, credential, or permission that is unavailable.'

export function asksUserToProduceDeliverable(question: string): boolean {
  return /\b(?:please\s+)?(?:create|write|draft|produce|prepare|complete|generate)\b.{0,100}\b(?:deliverable|artifact|report|brief|analysis|document)\b/i.test(question)
}

export function asksUserToManageTools(question: string): boolean {
  return /\b(?:please\s+)?(?:register|install|create|build|develop|configure|set up|enable)\b.{0,100}\b(?:tool|skill|plugin|integration|mcp|service)\b/i.test(question)
    || /\b(?:tool|skill|plugin|integration|mcp)\b.{0,100}\b(?:register|install|create|configure|set up)\s+(?:it|the tool|the skill)\b/i.test(question)
    || /\b(?:choose|select|pick)\b.{0,100}\b(?:tool id|tools? from (?:the )?list|from (?:the )?(?:list|available|following).{0,30}tools?)\b/i.test(question)
    // Asking the user to supply tool *configuration* (base URL, endpoint, host,
    // port, provider name, domain) is a setup task the agent must resolve itself.
    // Pure secret asks (api key, token, password, credentials) are intentionally
    // excluded here — those are legitimate named-secret questions.
    || /\b(?:provide|enter|give|share|paste|supply|input|specify|set)\b.{0,80}\b(?:base\s*urls?|endpoints?|hosts?|servers?|ports?|config(?:uration)?|provider\s+name|account\s+name|domains?)\b/i.test(question)
}

export function asksForProviderSetup(question: string): boolean {
  return /\b(?:which|what|choose|select|pick|provide|tell me|share)\b.{0,100}\b(?:provider|integration)\b/i.test(question)
    || /\b(?:provider|integration)\b.{0,100}\b(?:account|name|credentials?|api key|auth token)\b/i.test(question)
    || /\b(?:account|credentials?|api key|auth token)\b.{0,100}\b(?:provider|integration)\b/i.test(question)
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
