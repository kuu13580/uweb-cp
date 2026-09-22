import { callMethod, getProp } from '../../reflect'
import type { InboundTransport } from '../types'

const NOOP = () => undefined

/**
 * Receiving through the paste event. The default, being the only path that works everywhere.
 *
 * navigator.clipboard.readText is too constrained by permissions and gestures to read
 * implicitly, so this picks up the user's own paste instead.
 */
export function pasteTransport(target?: EventTarget): InboundTransport {
  return {
    id: 'paste',

    start(handler) {
      const node = target ?? defaultTarget()
      if (!node) return NOOP

      const listener = (event: Event) => {
        const text = clipboardText(event)
        if (text) handler(text, { source: 'paste' })
      }

      node.addEventListener('paste', listener)
      return () => node.removeEventListener('paste', listener)
    },
  }
}

function defaultTarget(): EventTarget | undefined {
  return typeof globalThis.document === 'undefined' ? undefined : globalThis.document
}

function clipboardText(event: Event): string | undefined {
  const data = getProp(event, 'clipboardData')
  const text = callMethod(data, 'getData', ['text/plain'])
  return typeof text === 'string' && text.length > 0 ? text : undefined
}
