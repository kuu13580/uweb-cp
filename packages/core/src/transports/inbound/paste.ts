import { callMethod, getProp } from '../../reflect'
import type { InboundTransport } from '../types'

const NOOP = () => undefined

/**
 * paste イベントによる受信。全ブラウザで動く唯一の経路なので既定とする。
 *
 * navigator.clipboard.readText は権限とユーザー操作の制約が強く暗黙の読み取りに
 * 使えないため、利用者の貼り付け操作そのものを拾う。
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
