import { describe, expect, it } from 'vite-plus/test'
import { findFencedRanges, findKeyedObjects, findObjects } from '../src/scan'

const sliceOf = (text: string, span: { start: number; end: number }) =>
  text.slice(span.start, span.end)

describe('findKeyedObjects', () => {
  it('finds an object in surrounding prose', () => {
    const text = 'はい、まとめました。\n{"ucp":1,"kind":"response"}\n以上です。'
    const spans = findKeyedObjects(text, 'ucp')
    expect(spans).toHaveLength(1)
    expect(sliceOf(text, spans[0]!)).toBe('{"ucp":1,"kind":"response"}')
  })

  it('finds the object even when the key is not first', () => {
    const text = 'prefix {"kind":"response","ucp":1} suffix'
    const spans = findKeyedObjects(text, 'ucp')
    expect(spans).toHaveLength(1)
    expect(sliceOf(text, spans[0]!)).toBe('{"kind":"response","ucp":1}')
  })

  it('is not confused by an unbalanced quote in the prose before it', () => {
    const text = 'I would say "roughly 3 days — see below:\n{"ucp":1,"kind":"response"}'
    const spans = findKeyedObjects(text, 'ucp')
    expect(spans).toHaveLength(1)
    expect(sliceOf(text, spans[0]!)).toBe('{"ucp":1,"kind":"response"}')
  })

  it('is not confused by an unclosed brace in the prose before it', () => {
    const text = 'テンプレートは { のように書きます。\n{"ucp":1,"kind":"response"}'
    const spans = findKeyedObjects(text, 'ucp')
    expect(spans).toHaveLength(1)
    expect(sliceOf(text, spans[0]!)).toBe('{"ucp":1,"kind":"response"}')
  })

  it('keeps braces and escaped quotes inside string values', () => {
    const text = '{"ucp":1,"note":"a } and a \\" inside"}'
    const spans = findKeyedObjects(text, 'ucp')
    expect(spans).toHaveLength(1)
    expect(sliceOf(text, spans[0]!)).toBe(text)
  })

  it('handles nested objects', () => {
    const text = '{"ucp":1,"data":{"days":[{"n":1}]}}'
    const spans = findKeyedObjects(text, 'ucp')
    expect(spans).toHaveLength(1)
    expect(sliceOf(text, spans[0]!)).toBe(text)
  })

  it('returns the outermost object when the key is nested too', () => {
    const text = '{"ucp":1,"data":{"ucp":"転記ミス"}}'
    const spans = findKeyedObjects(text, 'ucp')
    expect(spans).toHaveLength(1)
    expect(sliceOf(text, spans[0]!)).toBe(text)
  })

  it('finds multiple objects in order of appearance', () => {
    const text = 'まず {"ucp":1,"n":1} 次に {"ucp":1,"n":2}'
    const spans = findKeyedObjects(text, 'ucp')
    expect(spans.map((s) => sliceOf(text, s))).toEqual(['{"ucp":1,"n":1}', '{"ucp":1,"n":2}'])
  })

  it('ignores the key when it appears as a value', () => {
    const text = '{"name":"ucp","n":1}'
    expect(findKeyedObjects(text, 'ucp')).toHaveLength(0)
  })

  it('allows whitespace between the key and the colon', () => {
    const text = '{ "ucp" : 1 }'
    expect(findKeyedObjects(text, 'ucp')).toHaveLength(1)
  })

  it('skips objects that are not valid JSON', () => {
    const text = "{'ucp': 1}"
    expect(findKeyedObjects(text, 'ucp')).toHaveLength(0)
  })

  it('returns nothing when the object is never closed', () => {
    const text = '{"ucp":1,"kind":"response"'
    expect(findKeyedObjects(text, 'ucp')).toHaveLength(0)
  })

  it('exposes the parsed value', () => {
    const spans = findKeyedObjects('{"ucp":1,"kind":"response"}', 'ucp')
    expect(spans[0]?.value).toEqual({ ucp: 1, kind: 'response' })
  })
})

describe('findObjects', () => {
  it('finds top-level objects and skips nested ones', () => {
    const text = 'a {"x":{"y":1}} b {"z":2}'
    const spans = findObjects(text)
    expect(spans.map((s) => sliceOf(text, s))).toEqual(['{"x":{"y":1}}', '{"z":2}'])
  })

  it('steps over an unbalanced brace in prose', () => {
    const text = 'open { then {"z":2}'
    const spans = findObjects(text)
    expect(spans.map((s) => sliceOf(text, s))).toEqual(['{"z":2}'])
  })
})

describe('findFencedRanges', () => {
  it('returns the inside of a fenced block', () => {
    const text = 'まえがき\n```json ucp\n{"ucp":1}\n```\nあとがき'
    const ranges = findFencedRanges(text)
    expect(ranges).toHaveLength(1)
    expect(text.slice(ranges[0]!.start, ranges[0]!.end).trim()).toBe('{"ucp":1}')
  })

  it('treats an unclosed fence as running to the end', () => {
    const text = 'まえがき\n```json\n{"ucp":1}'
    const ranges = findFencedRanges(text)
    expect(ranges).toHaveLength(1)
    expect(text.slice(ranges[0]!.start, ranges[0]!.end).trim()).toBe('{"ucp":1}')
  })

  it('returns nothing when there is no fence', () => {
    expect(findFencedRanges('{"ucp":1}')).toHaveLength(0)
  })
})
