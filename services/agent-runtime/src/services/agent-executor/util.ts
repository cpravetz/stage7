import { MAX_ACTION_RESULT_CHARS } from './constants'

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function truncateMiddle(
  content: string,
  maxChars: number,
  label = 'content',
): string {
  if (content.length <= maxChars) return content
  const omittedChars = content.length
  const omittedBytes = Buffer.byteLength(content, 'utf8')
  const buildMarker = (headLen: number, tailLen: number) => {
    const omitted = Math.max(0, content.length - headLen - tailLen)
    return `\n[${label} truncated; ${omitted} chars / ${omittedBytes} bytes omitted (kept head/tail)]\n`
  }
  let marker = buildMarker(0, 0)
  if (maxChars <= marker.length + 2) {
    return content.slice(0, Math.max(0, maxChars))
  }
  const budget = maxChars - marker.length
  const headLen = Math.max(1, Math.ceil(budget / 2))
  const tailLen = Math.max(1, budget - headLen)
  marker = buildMarker(headLen, tailLen)
  const finalBudget = maxChars - marker.length
  const finalHead = Math.max(1, Math.ceil(finalBudget / 2))
  const finalTail = Math.max(1, finalBudget - finalHead)
  return `${content.slice(0, finalHead)}${marker}${content.slice(content.length - finalTail)}`
}

export function boundedActionResult(content: string): string {
  if (content.length <= MAX_ACTION_RESULT_CHARS) return content
  return truncateMiddle(content, MAX_ACTION_RESULT_CHARS, 'Tool output')
}
