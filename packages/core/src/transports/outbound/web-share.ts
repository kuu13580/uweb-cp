import { UcpError } from '../../errors'
import { callMethod, hasMethod } from '../../reflect'
import type { OutboundTransport } from '../types'

/** Sending through navigator.share. The primary path on mobile. */
export function webShareTransport(): OutboundTransport {
  return {
    id: 'web-share',

    isAvailable() {
      return hasMethod(globalThis.navigator, 'share')
    },

    async deliver(payload) {
      if (!hasMethod(globalThis.navigator, 'share')) {
        throw new UcpError('transport-unavailable', 'navigator.share is unavailable')
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
          throw new UcpError('transport-aborted', 'the share sheet was dismissed', { cause })
        }
        throw new UcpError('transport-unavailable', 'sharing failed', { cause })
      }
    },
  }
}

/** The user merely dismissed the share sheet. Told apart so it is not treated as a failure. */
function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError'
}
