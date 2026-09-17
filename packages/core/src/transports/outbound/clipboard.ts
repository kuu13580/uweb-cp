import type { OutboundTransport } from '../types'

/** navigator.clipboard.writeText による送信。デスクトップでの主経路。TODO: 実装。 */
export function clipboardTransport(): OutboundTransport {
  throw new Error('not implemented')
}
