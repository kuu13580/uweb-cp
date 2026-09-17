import type { InboundTransport } from '../types'

/**
 * paste イベントによる受信。全ブラウザで動く唯一の経路なので既定とする。
 * TODO: 実装。
 */
export function pasteTransport(_target?: EventTarget): InboundTransport {
  throw new Error('not implemented')
}
