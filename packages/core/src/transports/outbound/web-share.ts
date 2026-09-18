import { UcpError } from '../../errors'
import { callMethod, hasMethod } from '../../reflect'
import type { OutboundTransport } from '../types'

/** navigator.share による送信。モバイルでの主経路。 */
export function webShareTransport(): OutboundTransport {
  return {
    id: 'web-share',

    isAvailable() {
      return hasMethod(globalThis.navigator, 'share')
    },

    async deliver(payload) {
      if (!hasMethod(globalThis.navigator, 'share')) {
        throw new UcpError('transport-unavailable', 'navigator.share が使えない')
      }

      const data = {
        text: payload.text,
        ...(payload.title === undefined ? {} : { title: payload.title }),
        ...(payload.url === undefined ? {} : { url: payload.url }),
      }

      try {
        await callMethod(globalThis.navigator, 'share', [data])
      } catch (cause) {
        if (isAbort(cause)) {
          throw new UcpError('transport-aborted', '共有シートが閉じられた', { cause })
        }
        throw new UcpError('transport-unavailable', '共有に失敗した', { cause })
      }
    },
  }
}

/** 利用者が共有シートを閉じただけの場合。失敗として扱わないよう区別する。 */
function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError'
}
