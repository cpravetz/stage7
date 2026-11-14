import { MAX_ACTION_RESULT_CHARS } from './constants'

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function boundedActionResult(content: string): string {
  if (content.length <= MAX_ACTION_RESULT_CHARS) return content
  const marker = '\n[Tool output truncated; request a targeted result for more detail.]'
  return `${content.slice(0, MAX_ACTION_RESULT_CHARS - marker.length)}${marker}`
}
