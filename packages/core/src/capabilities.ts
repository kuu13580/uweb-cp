export type ShareTargetState = 'installed' | 'installable' | 'unsupported'

export interface Capabilities {
  /** navigator.share が使えるか。 */
  webShare: boolean
  webShareFiles: boolean
  clipboardWrite: boolean
  /** navigator.clipboard.readText。権限・ジェスチャ制約が強いので paste イベントを優先する。 */
  clipboardRead: boolean
  /** paste イベント経由の受信。ブラウザなら常に true。 */
  pasteEvent: boolean
  shareTarget: ShareTargetState
  /** display-mode: standalone 等でインストール済みと判定できたか。 */
  installedPwa: boolean
}

/** TODO: 実装。SSR でも落ちないよう全 false を返すこと。 */
export function detectCapabilities(): Capabilities {
  throw new Error('not implemented')
}

export interface TransportRecommendation {
  /** 上から順に試すべき OutboundTransport の id。 */
  outbound: string[]
  /** 有効化すべき InboundTransport の id。paste は常に含まれる。 */
  inbound: string[]
}

/** TODO: 実装。capabilities から推奨順のフォールバック列を組む。 */
export function recommendTransports(_capabilities: Capabilities): TransportRecommendation {
  throw new Error('not implemented')
}
