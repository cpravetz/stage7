import type { AgentAction } from './types'
import { asRecord } from './util'

export function parseAction(content: string): AgentAction | undefined {
  const normalized = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    const parsed = asRecord(JSON.parse(normalized))
    const args = asRecord(parsed?.args)
    if (typeof parsed?.tool !== 'string' || !args) return undefined
    return { tool: parsed.tool, args }
  } catch {
    return undefined
  }
}

export function parseSingleWrappedAction(content: string): AgentAction | undefined {
  const normalized = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let value: unknown
  try {
    value = JSON.parse(normalized)
  } catch {
    return undefined
  }

  for (let depth = 0; depth < 8; depth++) {
    if (Array.isArray(value)) {
      if (value.length !== 1) return undefined
      value = value[0]
      continue
    }
    const record = asRecord(value)
    if (!record) return undefined
    const args = asRecord(record.args)
    if (typeof record.tool === 'string' && args) {
      return { tool: record.tool, args }
    }
    const keys = Object.keys(record)
    if (keys.length !== 1) return undefined
    value = record[keys[0]!]
  }
  return undefined
}

export function parseLeadingAction(content: string): AgentAction | undefined {
  const normalized = content.trim()
  const leadingFence = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (leadingFence?.[1] !== undefined) return parseAction(leadingFence[1])
  if (!normalized.startsWith('{')) return undefined

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < normalized.length; index++) {
    const character = normalized[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }

    if (character === '"') inString = true
    else if (character === '{') depth++
    else if (character === '}' && --depth === 0) {
      return parseAction(normalized.slice(0, index + 1))
    }
  }
  return undefined
}

function containsToolActionShape(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsToolActionShape)
  const record = asRecord(value)
  if (!record) return false
  if (typeof record.tool === 'string' && asRecord(record.args)) return true
  if (record.action === 'tool_use' && typeof record.toolId === 'string' && asRecord(record.parameters)) return true
  return Object.values(record).some(containsToolActionShape)
}

/** True when the text embeds a tool-action-shaped JSON object anywhere (even with surrounding prose). */
export function containsToolAction(content: string): boolean {
  const objectStarts: number[] = []
  let inString = false
  let escaped = false

  for (let index = 0; index < content.length; index++) {
    const character = content[index]
    if (objectStarts.length === 0) {
      if (character === '{') {
        objectStarts.push(index)
        inString = false
        escaped = false
      }
      continue
    }

    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }

    if (character === '"') {
      inString = true
    } else if (character === '{') {
      objectStarts.push(index)
    } else if (character === '}') {
      const start = objectStarts.pop()
      if (start === undefined) continue
      if (objectStarts.length === 0) {
        try {
          if (containsToolActionShape(JSON.parse(content.slice(start, index + 1)))) return true
        } catch {
          // Ignore malformed JSON objects; the caller will request a corrected response.
        }
        inString = false
        escaped = false
      }
    }
  }

  return false
}

export type ReplyShape = 'exact' | 'leading' | 'wrapped'

export interface InterpretedReply {
  action: AgentAction
  /**
   * How the action was recovered: `exact` means the whole reply was the action;
   * `leading` means trailing narration was ignored; `wrapped` means a single
   * unambiguous wrapper (array/object nesting) was unwrapped.
   */
  shape: ReplyShape
}

/** Extracts the single executable action from a Brain reply, if there is one. */
export function interpretReply(content: string): InterpretedReply | undefined {
  const exact = parseAction(content)
  if (exact) return { action: exact, shape: 'exact' }
  const leading = parseLeadingAction(content)
  if (leading) return { action: leading, shape: 'leading' }
  const wrapped = parseSingleWrappedAction(content)
  if (wrapped) return { action: wrapped, shape: 'wrapped' }
  return undefined
}
