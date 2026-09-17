import type { ContractRef, JSONSchema } from './types'

/** 封筒フォーマットのバージョン。LLM 応答の識別キーも兼ねる。 */
export const ENVELOPE_VERSION = 1

/** 本文中から封筒を見つけるためのセンチネル。コードフェンスの有無に依存しない。 */
export const ENVELOPE_SENTINEL = '"ucp"'

/** コードフェンスに付ける情報文字列。剥がされる前提でヒント扱いとする。 */
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
