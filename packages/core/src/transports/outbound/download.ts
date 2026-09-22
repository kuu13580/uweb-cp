import { UcpError } from '../../errors'
import { hasMethod } from '../../reflect'
import type { OutboundTransport } from '../types'

const DEFAULT_FILENAME = 'uweb-cp.md'

/** Last resort: save a Blob as .md. For environments with neither sharing nor a clipboard. */
export function downloadTransport(filename: string = DEFAULT_FILENAME): OutboundTransport {
  return {
    id: 'download',

    isAvailable() {
      return typeof globalThis.document !== 'undefined' && hasMethod(URL, 'createObjectURL')
    },

    // Failures must surface as a rejection, since the caller's fallback chain awaits this
    async deliver(payload) {
      if (typeof globalThis.document === 'undefined' || !hasMethod(URL, 'createObjectURL')) {
        throw new UcpError('transport-unavailable', 'this environment cannot download')
      }

      const url = URL.createObjectURL(new Blob([payload.text], { type: 'text/markdown' }))
      try {
        const anchor = globalThis.document.createElement('a')
        anchor.href = url
        anchor.download = filename
        anchor.click()
      } finally {
        // click starts synchronously, so releasing here is safe
        URL.revokeObjectURL(url)
      }

      await Promise.resolve()
    },
  }
}
