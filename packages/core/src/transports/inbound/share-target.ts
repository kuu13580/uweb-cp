import type { InboundTransport } from '../types'

export interface ShareTargetOptions {
  /** manifest の share_target.action と一致させる。 */
  action?: string
  /** manifest の share_target.params に合わせたクエリ名。 */
  params?: { title?: string; text?: string; url?: string }
}

/**
 * PWA の Web Share Target からの受信。
 * Chromium 系 (Android Chrome / デスクトップ Chrome・Edge) のみ、かつインストール済みが前提。
 * TODO: 実装。GET 起動時の location 解析と、POST 用 Service Worker の受け口を用意する。
 */
export function shareTargetTransport(_options?: ShareTargetOptions): InboundTransport {
  throw new Error('not implemented')
}

/**
 * manifest.json にマージする share_target 断片を生成する。
 * 受信側の実装と manifest の params 名がずれると無言で壊れるため、同じ場所から出す。
 * TODO: 実装。
 */
export function shareTargetManifest(_options?: ShareTargetOptions): Record<string, unknown> {
  throw new Error('not implemented')
}
