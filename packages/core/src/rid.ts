import { callMethod } from './reflect'

/**
 * 相関 ID。LLM に書き写してもらう前提なので短くする。
 * 衝突が問題になるのは「同じ利用者の応答待ち一覧の中」だけなので、この長さで足りる。
 */
export function createRid(): string {
  const uuid = callMethod(globalThis.crypto, 'randomUUID', [])
  if (typeof uuid === 'string') return `r_${uuid.replaceAll('-', '').slice(0, 8)}`
  return `r_${Math.random().toString(36).slice(2, 10)}`
}
