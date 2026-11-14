import { asRecord } from './util'

/** True when a tool "succeeded" at the transport level but its payload reports failure. */
export function isToolFailurePayload(value: unknown, depth = 0): boolean {
  if (depth > 4) return false
  let payload = asRecord(value)
  if (!payload && typeof value === 'string') {
    try {
      payload = asRecord(JSON.parse(value))
    } catch {
      return false
    }
  }
  if (!payload) return false
  const failed = payload.success === false
    || payload.isError === true
    || payload.status === 'failed'
    || (typeof payload.error === 'string' && payload.error.trim().length > 0)
  if (failed) return true
  return ['output', 'data', 'result'].some((key) => isToolFailurePayload(payload[key], depth + 1))
}

export function isConfigurationFailure(content: string): boolean {
  return /\b(?:not configured|no .{1,80} configured|missing (?:the )?.{1,80}credential|requires? (?:the )?.{1,80}credential|credential .{1,80} missing)\b/i.test(content)
}

export function getMissingRuntimeModule(content: string): string | undefined {
  return content.match(/Cannot find (?:module|package)\s+['"]?([@a-z0-9._/-]+)['"]?/i)?.[1]
}
