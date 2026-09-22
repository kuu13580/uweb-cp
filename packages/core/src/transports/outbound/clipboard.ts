import { UcpError } from '../../errors'
import { callMethod, getProp, hasMethod } from '../../reflect'
import type { OutboundTransport } from '../types'

const clipboard = () => getProp(globalThis.navigator, 'clipboard')

/** Sending through navigator.clipboard.writeText. The primary path on desktop. */
export function clipboardTransport(): OutboundTransport {
  return {
    id: 'clipboard',

    isAvailable() {
      return hasMethod(clipboard(), 'writeText')
    },

    async deliver(payload) {
      if (!hasMethod(clipboard(), 'writeText')) {
        throw new UcpError('transport-unavailable', 'navigator.clipboard.writeText is unavailable')
      }

      try {
        await callMethod(clipboard(), 'writeText', [payload.text])
      } catch (cause) {
        // A denied permission and a call outside a gesture both land here
        throw new UcpError('transport-unavailable', 'clipboard write was denied', {
          cause,
        })
      }
    },
  }
}
