import type { InboundTransport } from '../types'

/** テキストファイルのドラッグ&ドロップによる受信。TODO: 実装。 */
export function fileDropTransport(_target: EventTarget): InboundTransport {
  throw new Error('not implemented')
}
