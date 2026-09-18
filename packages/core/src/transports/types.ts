export type OutboundTransportId = 'web-share' | 'clipboard' | 'deep-link' | 'download'

export type InboundTransportId = 'paste' | 'file-drop' | 'share-target'

export interface OutboundPayload {
  /** チャットアプリへ渡す本文。 */
  text: string
  title?: string
  url?: string
}

export interface OutboundTransport {
  readonly id: OutboundTransportId
  /** 文字数の実用上限。超える場合は他の経路へフォールバックする。 */
  readonly maxLength?: number
  isAvailable(): boolean | Promise<boolean>
  deliver(payload: OutboundPayload): Promise<void>
}

export interface InboundMeta {
  source: string
  title?: string
  url?: string
}

export type InboundHandler = (text: string, meta: InboundMeta) => void

export interface InboundTransport {
  readonly id: InboundTransportId
  /** 購読を開始し、解除関数を返す。 */
  start(handler: InboundHandler): () => void
}
