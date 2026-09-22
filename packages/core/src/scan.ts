/**
 * Low-level scanning for the extent of a JSON object inside text.
 *
 * A reply contains prose, unbalanced brackets and stray quotes, so lexing the whole text
 * from the start means one loose quote corrupts everything after it. Scanning therefore
 * only ever runs forward from a candidate `{`, and never interprets the prose.
 */

export interface ObjectSpan {
  /** Index of the `{`. */
  start: number
  /** Index just past the `}`. */
  end: number
  /** The result of parsing `text.slice(start, end)`. */
  value: unknown
}

export interface Range {
  start: number
  end: number
}

/**
 * Anchored on `"<key>"`, returns the extent of each object that owns that key, in order.
 * Where the same key nests, the outer object wins.
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

/** Every parseable object extent, front to back. Nested objects yield the outer one only. */
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

/** The ranges inside code fences. An unclosed fence is taken to run to the end. */
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

/** The object containing `sentinelAt`, trying the nearest `{` first and taking the first that parses. */
function objectContaining(text: string, sentinelAt: number, key: string): ObjectSpan | undefined {
  let open = text.lastIndexOf('{', sentinelAt)

  while (open !== -1) {
    const span = objectAt(text, open)
    if (span && span.end > sentinelAt && hasKey(span.value, key)) return span

    // lastIndexOf clamps a negative fromIndex to 0, so stop here rather than loop forever
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

/** Index just past the `}` matching `{`, stepping over string literals and escapes. */
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

/** Whether `"key"` is followed by `:`, to reject the same string appearing as a value. */
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
