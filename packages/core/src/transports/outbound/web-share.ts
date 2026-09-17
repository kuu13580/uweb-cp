import type { OutboundTransport } from '../types'

/** navigator.share による送信。モバイルでの主経路。TODO: 実装。 */
export function webShareTransport(): OutboundTransport {
  throw new Error('not implemented')
}
