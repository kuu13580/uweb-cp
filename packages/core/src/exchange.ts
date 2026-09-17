import type { Extraction } from './extract'
import type { PendingStore } from './store'
import type { InboundTransport, OutboundTransport } from './transports/types'
import type { Contract, Result } from './types'

export interface ExchangeOptions<T> {
  contract: Contract<T>
  /** 未指定なら detectCapabilities() から推奨順に選ぶ。 */
  outbound?: OutboundTransport[]
  inbound?: InboundTransport[]
  store?: PendingStore
  /** 応答待ちの要求を破棄するまでの時間。既定 24h。 */
  ttlMs?: number
}

export interface SendInput {
  context?: unknown
  instruction?: string
}

export interface SendResult {
  rid: string
  /** 実際に使われた OutboundTransport の id。 */
  via: string
  prompt: string
}

/**
 * 1 契約に対する送受信のまとまり。ライブラリ利用者が普段触るのはこれだけ。
 */
export interface Exchange<T> {
  readonly contract: Contract<T>
  /** 送信せずプロンプト文字列だけ得る (自前 UI 用)。 */
  preview(input?: SendInput): string
  send(input?: SendInput): Promise<SendResult>
  /** 任意のテキストを受け取って検証済みデータにする。 */
  accept(text: string): Promise<Result<Extraction<T>>>
  /** inbound transport を購読する。解除関数を返す。 */
  listen(onResult: (result: Result<Extraction<T>>) => void): () => void
}

/** TODO: 実装。 */
export function createExchange<T>(_options: ExchangeOptions<T>): Exchange<T> {
  throw new Error('not implemented')
}
