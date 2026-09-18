/**
 * テキストから JSON オブジェクトの範囲を取り出す低レベル走査。
 *
 * LLM の返信は地の文・未対応の括弧・引用符を含むため、テキスト全体を先頭から
 * 字句解析すると 1 個の野良クォートで以降がすべて壊れる。そこで走査は必ず
 * 「候補となる `{` から前方へ」だけ行い、地の文を解釈しない。
 */

export interface ObjectSpan {
  /** `{` の位置。 */
  start: number
  /** `}` の次の位置。 */
  end: number
  /** `text.slice(start, end)` をパースした結果。 */
  value: unknown
}

export interface Range {
  start: number
  end: number
}

/**
 * `"<key>"` をアンカーに、それを直接持つオブジェクトの範囲を出現順に返す。
 * 入れ子の同名キーは外側が勝つ。
 */
export function findKeyedObjects(text: string, key: string): ObjectSpan[] {
  const needle = `"${key}"`
  const found: ObjectSpan[] = []

  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    if (!isKeyPosition(text, at + needle.length)) continue
    const span = objectContaining(text, at, key)
    if (span) found.push(span)
  }

  return dropContained(found)
}

/** 前方から順に、パースできるオブジェクトの範囲を返す。入れ子は外側のみ。 */
export function findObjects(text: string): ObjectSpan[] {
  const found: ObjectSpan[] = []

  for (let at = text.indexOf('{'); at !== -1; at = text.indexOf('{', at + 1)) {
    const span = objectAt(text, at)
    if (!span) continue
    found.push(span)
    at = span.end - 1
  }

  return found
}

/** コードフェンスの内側の範囲。閉じられていないフェンスは末尾までとみなす。 */
export function findFencedRanges(text: string): Range[] {
  const fence = /^[ \t]{0,3}(?:`{3,}|~{3,})[^\n]*$/gm
  const ranges: Range[] = []
  let open: number | undefined

  for (let m = fence.exec(text); m !== null; m = fence.exec(text)) {
    if (open === undefined) open = m.index + m[0].length
    else {
      ranges.push({ start: open, end: m.index })
      open = undefined
    }
  }
  if (open !== undefined) ranges.push({ start: open, end: text.length })

  return ranges
}

export function isInside(ranges: readonly Range[], at: number): boolean {
  return ranges.some((r) => at >= r.start && at < r.end)
}

/** `sentinelAt` を含むオブジェクトを、近い `{` から順に試して最初に成立したものを返す。 */
function objectContaining(text: string, sentinelAt: number, key: string): ObjectSpan | undefined {
  let open = text.lastIndexOf('{', sentinelAt)

  while (open !== -1) {
    const span = objectAt(text, open)
    if (span && span.end > sentinelAt && hasKey(span.value, key)) return span

    // lastIndexOf は負の fromIndex を 0 に丸めるため、0 まで来たら自前で打ち切る
    if (open === 0) return undefined
    open = text.lastIndexOf('{', open - 1)
  }

  return undefined
}

function objectAt(text: string, start: number): ObjectSpan | undefined {
  const end = balancedEnd(text, start)
  if (end === undefined) return undefined

  let value: unknown
  try {
    value = JSON.parse(text.slice(start, end))
  } catch {
    return undefined
  }
  return { start, end, value }
}

/** 文字列リテラルとエスケープを跨いで `{` の対応する `}` の次の位置を返す。 */
function balancedEnd(text: string, start: number): number | undefined {
  if (text[start] !== '{') return undefined

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }

    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return i + 1
  }

  return undefined
}

/** `"key"` の直後が `:` であること。値として現れた同名文字列を除くため。 */
function isKeyPosition(text: string, from: number): boolean {
  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (ch === ':') return true
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') return false
  }
  return false
}

function hasKey(value: unknown, key: string): boolean {
  return typeof value === 'object' && value !== null && key in value
}

function dropContained(spans: readonly ObjectSpan[]): ObjectSpan[] {
  const sorted = spans.toSorted((a, b) => a.start - b.start || b.end - a.end)
  const out: ObjectSpan[] = []

  for (const span of sorted) {
    const last = out[out.length - 1]
    if (last && span.start >= last.start && span.end <= last.end) continue
    out.push(span)
  }

  return out
}
