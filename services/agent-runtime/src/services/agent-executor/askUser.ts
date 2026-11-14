import { ASK_USER_MARKER, MAX_ASK_USER_QUESTION_LENGTH } from './constants'

export function asksUserToManageTools(question: string): boolean {
  return /\b(?:please\s+)?(?:register|install|create|build|develop|configure|set up|enable)\b.{0,100}\b(?:tool|skill|plugin|integration|mcp|service)\b/i.test(question)
    || /\b(?:tool|skill|plugin|integration|mcp)\b.{0,100}\b(?:register|install|create|configure|set up)\s+(?:it|the tool|the skill)\b/i.test(question)
    || /\b(?:choose|select|pick)\b.{0,100}\b(?:tool id|tools? from (?:the )?list|from (?:the )?(?:list|available|following).{0,30}tools?)\b/i.test(question)
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
    const cut = candidate.search(/\n\s*\n|\n\s*(?:Agent|System|User|Assistant)\s*:|\[action_receipt|\n\s*(?:```|\{)/i)
    if (cut >= 0) candidate = candidate.slice(0, cut)
    candidate = candidate.replace(/\s+/g, ' ').trim()
    if (candidate.startsWith('{')) return `${ASK_USER_MARKER}${content.slice(from).trim()}`
    if (candidate.length < 8 || /^followed by\b|^<question>|\bmark secret values with\b|\bDo not emit JSON\b/i.test(candidate)) continue
    if (candidate.length > MAX_ASK_USER_QUESTION_LENGTH) {
      const sentenceEnd = candidate.slice(0, MAX_ASK_USER_QUESTION_LENGTH).search(/[?.!](?!.*[?.!])/)
      candidate = sentenceEnd > 0 ? candidate.slice(0, sentenceEnd + 1) : `${candidate.slice(0, MAX_ASK_USER_QUESTION_LENGTH - 1)}…`
    }
    return `${ASK_USER_MARKER}${candidate}`
  }
}
