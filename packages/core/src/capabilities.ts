import { getProp, hasMethod, isTrue } from './reflect'
import type { InboundTransportId, OutboundTransportId } from './transports/types'

export type ShareTargetState = 'installed' | 'installable' | 'unsupported'

export interface Capabilities {
  /** navigator.share が使えるか。 */
  webShare: boolean
  /**
   * navigator.canShare が使えるか。実際にファイルを送れるかは
   * canShare({ files }) で都度確かめる必要があるため、ここでは問い合わせ口の有無だけを見る。
   */
  canShareQuery: boolean
  clipboardWrite: boolean
  /** navigator.clipboard.readText。権限・ジェスチャ制約が強いので paste イベントを優先する。 */
  clipboardRead: boolean
  /** paste イベント経由の受信。ブラウザなら常に true。 */
  pasteEvent: boolean
  shareTarget: ShareTargetState
  /** display-mode: standalone 等でインストール済みと判定できたか。 */
  installedPwa: boolean
}

export interface TransportRecommendation {
  /** 上から順に試すべき OutboundTransport の id。 */
  outbound: OutboundTransportId[]
  /** 有効化すべき InboundTransport の id。paste は常に含まれる。 */
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

/** 実行環境で使える経路を調べる。SSR では全て false を返し、例外を投げない。 */
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
 * 推奨経路。outbound は上から順に試すフォールバック列、inbound は同時に有効化する一覧。
 *
 * deep-link は送信先プロバイダの指定が要るため既定には含めない。
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
        // matchMedia は未知のクエリで投げる実装があるため、判定不能として次へ
      }
    }
  }
  // iOS Safari のホーム画面追加は display-mode を返さず、この非標準プロパティだけが手がかり
  return isTrue(globalThis.navigator, 'standalone')
}

/**
 * Web Share Target は Chromium 系のインストール済み PWA でしか使えず、機能検出の口が無い。
 * Chromium にしか存在しない `navigator.userAgentData` の有無を代理指標にする。
 */
function detectShareTarget(installedPwa: boolean): ShareTargetState {
  const nav: unknown = globalThis.navigator
  const chromium = typeof nav === 'object' && nav !== null && 'userAgentData' in nav
  if (!chromium || !('serviceWorker' in globalThis.navigator)) return 'unsupported'
  return installedPwa ? 'installed' : 'installable'
}
