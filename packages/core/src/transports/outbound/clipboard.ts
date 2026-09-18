import { UcpError } from '../../errors'
import { callMethod, getProp, hasMethod } from '../../reflect'
import type { OutboundTransport } from '../types'

const clipboard = () => getProp(globalThis.navigator, 'clipboard')

/** navigator.clipboard.writeText による送信。デスクトップでの主経路。 */
export function clipboardTransport(): OutboundTransport {
  return {
    id: 'clipboard',

    isAvailable() {
      return hasMethod(clipboard(), 'writeText')
    },

    async deliver(payload) {
      if (!hasMethod(clipboard(), 'writeText')) {
        throw new UcpError('transport-unavailable', 'navigator.clipboard.writeText が使えない')
      }

      try {
        await callMethod(clipboard(), 'writeText', [payload.text])
      } catch (cause) {
        // 権限拒否とユーザー操作外からの呼び出しはどちらもここに来る
        throw new UcpError('transport-unavailable', 'クリップボードへの書き込みが拒否された', {
          cause,
        })
      }
    },
  }
}
