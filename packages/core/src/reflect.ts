/**
 * 未知の値からプロパティやメソッドを取り出す小道具。
 *
 * DOM の機能検出では「型としては在るが実行環境には無い」ものを扱うため、
 * 型アサーションで存在を仮定せず、実際に触って確かめる。
 */

export function getProp(target: unknown, name: string): unknown {
  if (typeof target !== 'object' || target === null) return undefined
  return Reflect.get(target, name)
}

export function hasMethod(target: unknown, name: string): boolean {
  return typeof getProp(target, name) === 'function'
}

export function isTrue(target: unknown, name: string): boolean {
  return getProp(target, name) === true
}

/** メソッドが無ければ undefined を返す。呼べた場合の戻り値はそのまま。 */
export function callMethod(target: unknown, name: string, args: readonly unknown[]): unknown {
  const method = getProp(target, name)
  if (typeof method !== 'function') return undefined
  return Reflect.apply(method, target, args)
}
