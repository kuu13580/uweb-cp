import { UcpError } from '../../errors'
import { hasMethod } from '../../reflect'
import type { OutboundTransport } from '../types'

export interface DeepLinkProvider {
  id: string
  /** 例: 'https://example.com/new?q={prompt}' — {prompt} を URL エンコードして埋める。 */
  template: string
  /** URL 全体の実用上限。超えたら利用不可として扱う。 */
  maxLength: number
}

const PLACEHOLDER = '{prompt}'

/**
 * プロバイダ固有 URL へのディープリンク。
 *
 * 各社の URL パラメータ仕様は非公開かつ予告なく変わる (claude.ai/new?q= は実際に廃止された)
 * ため、ライブラリは宛先を同梱せず、テンプレートを受け取る仕組みだけを提供する。
 */
export function deepLinkTransport(provider: DeepLinkProvider): OutboundTransport {
  if (!provider.template.includes(PLACEHOLDER)) {
    throw new UcpError(
      'transport-unavailable',
      `template に ${PLACEHOLDER} が含まれていない: ${provider.template}`,
    )
  }

  return {
    id: 'deep-link',
    maxLength: provider.maxLength,

    isAvailable() {
      return hasMethod(globalThis, 'open')
    },

    // 例外は必ず reject として返す (呼び出し側は Promise 前提でフォールバックする)
    async deliver(payload) {
      const url = provider.template.replace(PLACEHOLDER, encodeURIComponent(payload.text))

      if (url.length > provider.maxLength) {
        throw new UcpError(
          'payload-too-large',
          `${provider.id} の上限 ${provider.maxLength} に対して ${url.length} 文字`,
        )
      }
      if (!hasMethod(globalThis, 'open')) {
        throw new UcpError('transport-unavailable', 'window.open が使えない')
      }

      globalThis.open(url, '_blank', 'noopener,noreferrer')
      await Promise.resolve()
    },
  }
}
