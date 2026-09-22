import { callMethod, getProp } from '../../reflect'
import type { InboundMeta, InboundTransport } from '../types'

export interface ShareTargetOptions {
  /** Must match share_target.action in the manifest. Left out, any path is accepted. */
  action?: string
  /** Query names, matching share_target.params in the manifest. */
  params?: { title?: string; text?: string; url?: string }
  /**
   * Strip the shared params from the URL once imported. Default true.
   * Leaving them in re-imports the same payload on every reload.
   */
  cleanUrl?: boolean
}

const DEFAULT_PARAMS = { title: 'title', text: 'text', url: 'url' } as const

const NOOP = () => undefined

/**
 * Receiving from a PWA's Web Share Target.
 *
 * Works only in an installed Chromium PWA (Chrome on Android, Chrome and Edge on desktop).
 * It reads the launch URL once and subscribes to nothing afterwards.
 *
 * GET only. POST — file sharing — makes registering a Service Worker the app's own
 * responsibility, so it is out of scope here.
 */
export function shareTargetTransport(options: ShareTargetOptions = {}): InboundTransport {
  return {
    id: 'share-target',

    start(handler) {
      const found = readFromLocation(options)
      if (!found) return NOOP

      // Hand it over only after the caller of start() has finished wiring up
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        if (options.cleanUrl !== false) stripSharedParams({ ...DEFAULT_PARAMS, ...options.params })
        handler(found.text, found.meta)
      })

      return () => {
        cancelled = true
      }
    },
  }
}

/** The share_target fragment to merge into manifest.json. Emitted next to the receiver so the param names cannot drift. */
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

  // Even with no body, a shared URL on its own is worth handing over
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

/** Removes only the shared params: the rest of the query belongs to the app. */
function stripSharedParams(names: { title: string; text: string; url: string }): void {
  const location = getProp(globalThis, 'location')
  const pathname = getProp(location, 'pathname')
  const search = getProp(location, 'search')
  if (typeof pathname !== 'string') return

  const kept = new URLSearchParams(typeof search === 'string' ? search : '')
  for (const name of [names.title, names.text, names.url]) kept.delete(name)

  const query = kept.toString()
  const next = query.length > 0 ? `${pathname}?${query}` : pathname
  callMethod(getProp(globalThis, 'history'), 'replaceState', [null, '', next])
}
