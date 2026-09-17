import type { OutboundTransport } from '../types'

export interface DeepLinkProvider {
  id: string
  /** 例: 'https://example.com/new?q={prompt}' — {prompt} を URL エンコードして埋める。 */
  template: string
  /** URL 全体の実用上限。超えたら利用不可として扱う。 */
  maxLength: number
}

/**
 * プロバイダ固有 URL へのディープリンク。
 * 各社の URL パラメータ仕様は非公開かつ変更されるため、ベストエフォートの補助経路と位置づける。
 * TODO: 実装。
 */
export function deepLinkTransport(_provider: DeepLinkProvider): OutboundTransport {
  throw new Error('not implemented')
}
