import { callMethod, getProp } from '../../reflect'
import type { InboundMeta, InboundTransport } from '../types'

export interface ShareTargetOptions {
  /** manifest の share_target.action と一致させる。省略時はパスを問わない。 */
  action?: string
  /** manifest の share_target.params に合わせたクエリ名。 */
  params?: { title?: string; text?: string; url?: string }
  /**
   * 取り込んだ後に URL からクエリを消す。既定 true。
   * 消さないと再読み込みのたびに同じ内容が再投入される。
   */
  cleanUrl?: boolean
}

const DEFAULT_PARAMS = { title: 'title', text: 'text', url: 'url' } as const

const NOOP = () => undefined

/**
 * PWA の Web Share Target からの受信。
 *
 * Chromium 系 (Android Chrome / デスクトップ Chrome・Edge) のインストール済み PWA でのみ動く。
 * 起動時の URL を一度読むだけで、以降は何も購読しない。
 *
 * method は GET のみ扱う。POST (ファイル共有) は Service Worker の登録がアプリ側の
 * 責務になるため、ここでは引き受けない。
 */
export function shareTargetTransport(options: ShareTargetOptions = {}): InboundTransport {
  return {
    id: 'share-target',

    start(handler) {
      const found = readFromLocation(options)
      if (!found) return NOOP

      // start() の呼び出し元が購読を組み終わってから渡す
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        if (options.cleanUrl !== false) stripQuery()
        handler(found.text, found.meta)
      })

      return () => {
        cancelled = true
      }
    },
  }
}

/** manifest.json にマージする share_target 断片。params 名のずれを防ぐため受信実装と同じ場所から出す。 */
export function shareTargetManifest(options: ShareTargetOptions = {}): Record<string, unknown> {
  return {
    action: options.action ?? '/',
    method: 'GET',
    params: { ...DEFAULT_PARAMS, ...options.params },
  }
}

function readFromLocation(
  options: ShareTargetOptions,
): { text: string; meta: InboundMeta } | undefined {
  const location = getProp(globalThis, 'location')
  const search = getProp(location, 'search')
  if (typeof search !== 'string' || search.length === 0) return undefined

  if (options.action !== undefined && getProp(location, 'pathname') !== options.action) {
    return undefined
  }

  const names = { ...DEFAULT_PARAMS, ...options.params }
  const query = new URLSearchParams(search)
  const text = query.get(names.text)
  const url = query.get(names.url)
  const title = query.get(names.title)

  // 本文が無くても、共有された URL だけは渡す価値がある
  const payload = text ?? url
  if (payload === null || payload.length === 0) return undefined

  return {
    text: payload,
    meta: {
      source: 'share-target',
      ...(title === null ? {} : { title }),
      ...(url === null ? {} : { url }),
    },
  }
}

function stripQuery(): void {
  const location = getProp(globalThis, 'location')
  const pathname = getProp(location, 'pathname')
  if (typeof pathname !== 'string') return
  callMethod(getProp(globalThis, 'history'), 'replaceState', [null, '', pathname])
}
