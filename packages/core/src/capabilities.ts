import { getProp, hasMethod, isTrue } from './reflect'
import type { InboundTransportId, OutboundTransportId } from './transports/types'

export type ShareTargetState = 'installed' | 'installable' | 'unsupported'

export interface Capabilities {
  /** Whether navigator.share is available. */
  webShare: boolean
  /**
   * Whether navigator.canShare is available. Whether files can actually be shared has to be
   * asked per payload with canShare({ files }), so this only reports that the query exists.
   */
  canShareQuery: boolean
  clipboardWrite: boolean
  /** navigator.clipboard.readText. Permission and gesture rules are strict, so prefer the paste event. */
  clipboardRead: boolean
  /** Receiving through the paste event. Always true in a browser. */
  pasteEvent: boolean
  shareTarget: ShareTargetState
  /** Whether the app looks installed, via display-mode: standalone and friends. */
  installedPwa: boolean
}

export interface TransportRecommendation {
  /** OutboundTransport ids to try, in order. */
  outbound: OutboundTransportId[]
  /** InboundTransport ids to enable. paste is always included. */
  inbound: InboundTransportId[]
}

const NONE: Capabilities = {
  webShare: false,
  canShareQuery: false,
  clipboardWrite: false,
  clipboardRead: false,
  pasteEvent: false,
  shareTarget: 'unsupported',
  installedPwa: false,
}

/** What this environment can do. Reports everything as false during SSR, and never throws. */
export function detectCapabilities(): Capabilities {
  if (typeof globalThis.navigator === 'undefined' || typeof globalThis.document === 'undefined') {
    return { ...NONE }
  }

  const nav: unknown = globalThis.navigator
  const clipboard = getProp(nav, 'clipboard')
  const installedPwa = detectInstalledPwa()
  const webShare = hasMethod(nav, 'share')

  return {
    webShare,
    canShareQuery: webShare && hasMethod(nav, 'canShare'),
    clipboardWrite: hasMethod(clipboard, 'writeText'),
    clipboardRead: hasMethod(clipboard, 'readText'),
    pasteEvent: true,
    shareTarget: detectShareTarget(installedPwa),
    installedPwa,
  }
}

/**
 * The recommended transports: outbound is a fallback chain tried in order, inbound is the set
 * to enable at once.
 *
 * deep-link is left out of the defaults because it needs a target provider to be named.
 */
export function recommendTransports(capabilities: Capabilities): TransportRecommendation {
  const outbound: OutboundTransportId[] = []
  if (capabilities.webShare) outbound.push('web-share')
  if (capabilities.clipboardWrite) outbound.push('clipboard')
  outbound.push('download')

  const inbound: InboundTransportId[] = ['paste', 'file-drop']
  if (capabilities.shareTarget === 'installed') inbound.push('share-target')

  return { outbound, inbound }
}

function detectInstalledPwa(): boolean {
  const displayModes = ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay']
  if (hasMethod(globalThis, 'matchMedia')) {
    for (const mode of displayModes) {
      try {
        if (globalThis.matchMedia(`(display-mode: ${mode})`).matches) return true
      } catch {
        // Some implementations throw on an unknown query, so treat it as undecidable and move on
      }
    }
  }
  // Add-to-home-screen on iOS Safari reports no display-mode; this non-standard property is the only clue
  return isTrue(globalThis.navigator, 'standalone')
}

/**
 * Web Share Target only works in an installed Chromium PWA, and there is nothing to feature
 * detect. `navigator.userAgentData` exists only in Chromium, so it stands in as the proxy.
 */
function detectShareTarget(installedPwa: boolean): ShareTargetState {
  const nav: unknown = globalThis.navigator
  const chromium = typeof nav === 'object' && nav !== null && 'userAgentData' in nav
  if (!chromium || !('serviceWorker' in globalThis.navigator)) return 'unsupported'
  return installedPwa ? 'installed' : 'installable'
}
