import { UcpError } from '../../errors'
import { hasMethod } from '../../reflect'
import type { OutboundTransport } from '../types'

const DEFAULT_FILENAME = 'uweb-cp.md'

/** Blob を .md として保存させる最終フォールバック。共有もクリップボードも無い環境向け。 */
export function downloadTransport(filename: string = DEFAULT_FILENAME): OutboundTransport {
  return {
    id: 'download',

    isAvailable() {
      return typeof globalThis.document !== 'undefined' && hasMethod(URL, 'createObjectURL')
    },

    // 例外は必ず reject として返す (呼び出し側は Promise 前提でフォールバックする)
    async deliver(payload) {
      if (typeof globalThis.document === 'undefined' || !hasMethod(URL, 'createObjectURL')) {
        throw new UcpError('transport-unavailable', 'ダウンロードできる環境ではない')
      }

      const url = URL.createObjectURL(new Blob([payload.text], { type: 'text/markdown' }))
      try {
        const anchor = globalThis.document.createElement('a')
        anchor.href = url
        anchor.download = filename
        anchor.click()
      } finally {
        // click は同期に処理が始まるので、ここで解放してよい
        URL.revokeObjectURL(url)
      }

      await Promise.resolve()
    },
  }
}
