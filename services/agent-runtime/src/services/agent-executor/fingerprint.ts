import { createHash } from 'node:crypto'
import type { AgentAction } from './types'

export interface ActionFingerprint {
  /** `tool:args-json`; two actions with the same signature are the same action. */
  signature: string
  /** sha256 of the signature; the stable id recorded on receipts. */
  actionKey: string
}

export function keyForSignature(signature: string): string {
  return createHash('sha256').update(signature).digest('hex')
}

export function fingerprintAction(action: AgentAction): ActionFingerprint {
  const signature = `${action.tool}:${JSON.stringify(action.args)}`
  return { signature, actionKey: keyForSignature(signature) }
}
