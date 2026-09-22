export type OutboundTransportId = 'web-share' | 'clipboard' | 'deep-link' | 'download'

export type InboundTransportId = 'paste' | 'file-drop' | 'share-target'

export interface OutboundPayload {
  /** The body handed to the chat app. */
  text: string
  title?: string
  url?: string
}

export interface OutboundTransport {
  readonly id: OutboundTransportId
  /** Practical character limit. Beyond it, delivery falls back to another transport. */
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
  /** Starts listening and returns the unsubscribe function. */
  start(handler: InboundHandler): () => void
}
