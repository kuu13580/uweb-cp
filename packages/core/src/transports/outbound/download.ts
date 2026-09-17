import type { OutboundTransport } from '../types'

/** Blob を .md として保存させる最終フォールバック。TODO: 実装。 */
export function downloadTransport(_filename?: string): OutboundTransport {
  throw new Error('not implemented')
}
