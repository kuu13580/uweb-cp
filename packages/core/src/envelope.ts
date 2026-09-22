import type { ContractRef, JSONSchema } from './types'

/** Envelope format version. Doubles as the key that marks a reply. */
export const ENVELOPE_VERSION = 1

/** Sentinel for finding an envelope in prose. Does not rely on a code fence being present. */
export const ENVELOPE_SENTINEL = '"ucp"'

/** Info string on the code fence. A hint only, since chat apps strip it. */
export const FENCE_INFO = 'json ucp'

export interface RequestEnvelope {
  ucp: typeof ENVELOPE_VERSION
  kind: 'request'
  rid: string
  contract: ContractRef
  schema: JSONSchema
  context?: unknown
}

export interface ResponseEnvelope<T = unknown> {
  ucp: typeof ENVELOPE_VERSION
  kind: 'response'
  rid?: string
  contract: ContractRef
  data: T
}

export type Envelope<T = unknown> = RequestEnvelope | ResponseEnvelope<T>

export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false
  if (!('ucp' in value) || !('kind' in value)) return false
  return value.ucp === ENVELOPE_VERSION && (value.kind === 'request' || value.kind === 'response')
}

export function isResponseEnvelope<T = unknown>(value: unknown): value is ResponseEnvelope<T> {
  return isEnvelope(value) && value.kind === 'response'
}
