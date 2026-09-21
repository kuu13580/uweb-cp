import { describe, expect, it } from 'vite-plus/test'
import { defineContract } from '../src/contract'
import { extractResponses, parseResponse } from '../src/extract'
import { buildPrompt } from '../src/prompt'
import { findKeyedObjects } from '../src/scan'

const trip = defineContract<{ days: number }>({
  id: 'trip.itinerary',
  description: '旅行の日程表を作ってください。',
  jsonSchema: { type: 'object', properties: { days: { type: 'number' } } },
  examples: [{ days: 1 }, { days: 2 }, { days: 3 }],
})

const build = (overrides: Partial<Parameters<typeof buildPrompt>[0]> = {}) =>
  buildPrompt({ contract: trip, rid: 'r_1', ...overrides })

describe('buildPrompt', () => {
  it('leads with the caller instruction', () => {
    const { text } = build({ instruction: '2泊3日の金沢旅行を組んで。' })
    expect(text.startsWith('2泊3日の金沢旅行を組んで。')).toBe(true)
  })

  it('falls back to the contract description', () => {
    expect(build().text.startsWith('旅行の日程表を作ってください。')).toBe(true)
  })

  it('embeds the request envelope', () => {
    const { request } = build({ context: { destination: '金沢' } })

    expect(request).toEqual({
      ucp: 1,
      kind: 'request',
      rid: 'r_1',
      contract: 'trip.itinerary@1',
      schema: trip.jsonSchema,
      context: { destination: '金沢' },
    })
  })

  it('omits context when none is given', () => {
    expect('context' in build().request).toBe(false)
  })

  it('embeds the request envelope as readable JSON', () => {
    const { text, request } = build({ context: { destination: '金沢' } })
    const found = findKeyedObjects(text, 'ucp')

    expect(found.some((span) => JSON.stringify(span.value) === JSON.stringify(request))).toBe(true)
  })

  it('never lets its own request envelope look like a response', () => {
    expect(extractResponses(build().text)).toHaveLength(0)
  })

  it('shows a response template carrying the same rid and contract', () => {
    const { text } = build({ rid: 'r_abc' })
    expect(text).toContain('"kind": "response"')
    expect(text).toContain('"rid": "r_abc"')
    expect(text).toContain('"contract": "trip.itinerary@1"')
  })

  it('limits the examples it shows', () => {
    expect(build({ maxExamples: 1 }).text).not.toContain('{\n  "days": 2\n}')
    expect(build({ maxExamples: 2 }).text).toContain('{\n  "days": 2\n}')
  })

  it('shows no example section for a contract without examples', () => {
    const bare = defineContract({ id: 'bare', jsonSchema: {} })
    expect(buildPrompt({ contract: bare, rid: 'r_1' }).text).not.toContain('Examples')
  })

  it('writes the scaffold in English by default and in Japanese for ja', () => {
    expect(build().text).toContain('Machine-readable request:')
    expect(build({ locale: 'ja-JP' }).text).toContain('機械可読の要求:')
  })

  it('tells the model to output now by default', () => {
    const { text, approvalPhrase } = build()
    expect(text).toContain('Reply with exactly one envelope')
    expect(text).not.toContain('approved')
    expect(approvalPhrase).toBeUndefined()
  })

  it('holds the envelope back until approval when asked', () => {
    const { text, approvalPhrase } = build({ emit: 'on-approval' })
    expect(text).toContain('Once I approve')
    expect(text).toContain('Do not output the envelope yet')
    expect(text).toContain('only after I reply "approved"')
    expect(approvalPhrase).toBe('approved')
  })

  it('keeps rid stable across turns in on-approval mode', () => {
    expect(build({ emit: 'on-approval' }).text).toContain('however many turns later')
  })

  it('localises the approval phrase', () => {
    const { text, approvalPhrase } = build({ emit: 'on-approval', locale: 'ja' })
    expect(approvalPhrase).toBe('確定')
    expect(text).toContain('「確定」と答えたら')
  })

  it('keeps the shared rules in both modes', () => {
    for (const emit of ['now', 'on-approval'] as const) {
      expect(build({ emit }).text).toContain('Make `data` conform to the `schema`')
    }
  })

  it('says nothing about going back unless asked', () => {
    expect(build().text).not.toContain('コピーして')
    expect(build().text).not.toContain('go back to')
  })

  it('tells the model to hand the user back to the app', () => {
    const { text } = build({
      locale: 'ja',
      returnTo: { name: '旅程メモ', url: 'https://trip.example' },
    })
    expect(text).toContain('コピーして 旅程メモ (https://trip.example) に戻り、貼り付けてください')
  })

  it('omits the url when there is none', () => {
    const { text } = build({ locale: 'ja', returnTo: { name: '旅程メモ' } })
    expect(text).toContain('コピーして 旅程メモ に戻り')
  })

  it('adds the hand-back line in both emit modes', () => {
    for (const emit of ['now', 'on-approval'] as const) {
      expect(build({ emit, returnTo: { name: 'app' } }).text).toContain('go back to app')
    }
  })

  it('reports its own length', () => {
    const built = build()
    expect(built.length).toBe(built.text.length)
  })
})

/** 封筒用の情報文字列が付いたフェンスの中身だけを取り出す。 */
const envelopeBlocks = (text: string) =>
  [...text.matchAll(/```json ucp\n([\s\S]*?)\n```/g)].map((m) => m[1] ?? '')

describe('prompt and extract agree', () => {
  it('shows exactly two envelope blocks: the request and the response template', () => {
    expect(envelopeBlocks(build().text)).toHaveLength(2)
  })

  it('round-trips a reply that fills in the template', async () => {
    const { text, request } = build({ instruction: '金沢 2 泊で。' })
    const template = envelopeBlocks(text)[1] ?? ''
    const filled = template.replace('<the result, conforming to schema>', '{ "days": 3 }')

    const result = await parseResponse(`承知しました。\n\n${filled}\n\nご確認ください。`, {
      contract: trip,
      rid: request.rid,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.envelope.data).toEqual({ days: 3 })
    expect(result.value.envelope.rid).toBe('r_1')
    expect(result.value.issues).toEqual([])
  })
})
