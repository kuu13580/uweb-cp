import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vite-plus/test'
import { defineContract } from '../src/contract'
import { extractResponses, parseResponse } from '../src/extract'

const schema = <T>(
  validate: StandardSchemaV1.Props<unknown, T>['validate'],
): StandardSchemaV1<unknown, T> => ({
  '~standard': { version: 1, vendor: 'test', validate },
})

const trip = (validate?: StandardSchemaV1<unknown, { days: number }>) =>
  defineContract({
    id: 'trip.itinerary',
    jsonSchema: { type: 'object' },
    ...(validate ? { validate } : {}),
  })

const response = (body: Record<string, unknown>) =>
  JSON.stringify({ ucp: 1, kind: 'response', contract: 'trip.itinerary@1', ...body })

describe('extractResponses', () => {
  it('returns response envelopes in order of appearance', () => {
    const text = `A ${response({ data: { days: 1 } })} B ${response({ data: { days: 2 } })}`
    expect(extractResponses(text).map((e) => e.data)).toEqual([{ days: 1 }, { days: 2 }])
  })

  it('ignores request envelopes', () => {
    const text = JSON.stringify({
      ucp: 1,
      kind: 'request',
      contract: 'trip.itinerary@1',
      rid: 'r1',
      schema: {},
    })
    expect(extractResponses(text)).toHaveLength(0)
  })
})

describe('parseResponse', () => {
  it('reads an envelope surrounded by prose', async () => {
    const text = `日程をまとめました。\n${response({ data: { days: 3 } })}\n以上です。`
    const result = await parseResponse(text)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.envelope.data).toEqual({ days: 3 })
    expect(result.value.via).toBe('sentinel-scan')
    expect(result.value.issues).toEqual([])
  })

  it('labels an envelope inside a code fence', async () => {
    const text = `どうぞ\n\`\`\`json ucp\n${response({ data: { days: 3 } })}\n\`\`\``
    const result = await parseResponse(text)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.via).toBe('fenced')
  })

  it('fails with no-envelope when there is nothing to find', async () => {
    const result = await parseResponse('すみません、うまく作れませんでした。')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('no-envelope')
  })

  it('reports an unsupported envelope version instead of ignoring it', async () => {
    const text = JSON.stringify({
      ucp: 2,
      kind: 'response',
      contract: 'trip.itinerary@1',
      data: {},
    })
    const result = await parseResponse(text)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('malformed-envelope')
  })

  it('accepts an envelope whose contract matches', async () => {
    const result = await parseResponse(response({ data: { days: 3 } }), { contract: trip() })
    expect(result.ok).toBe(true)
  })

  it('rejects a different contract version', async () => {
    const text = JSON.stringify({
      ucp: 1,
      kind: 'response',
      contract: 'trip.itinerary@2',
      data: {},
    })
    const result = await parseResponse(text, { contract: trip() })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('contract-mismatch')
  })

  it('prefers the rid match even when it appears first', async () => {
    const text = `${response({ rid: 'r1', data: { days: 1 } })}\n${response({ rid: 'r2', data: { days: 2 } })}`
    const result = await parseResponse(text, { rid: 'r1' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.envelope.data).toEqual({ days: 1 })
    expect(result.value.issues).toEqual([])
  })

  it('falls back to the last envelope when no rid matches', async () => {
    const text = `${response({ data: { days: 1 } })}\n${response({ data: { days: 2 } })}`
    const result = await parseResponse(text, { rid: 'r1' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.envelope.data).toEqual({ days: 2 })
    expect(result.value.issues).toHaveLength(1)
  })

  it('uses the last envelope when no rid is given', async () => {
    const text = `${response({ data: { days: 1 } })}\n${response({ data: { days: 2 } })}`
    const result = await parseResponse(text)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.envelope.data).toEqual({ days: 2 })
  })

  it('replaces data with the validator output', async () => {
    const contract = trip(schema(() => ({ value: { days: 99 } })))
    const result = await parseResponse(response({ data: { days: 3 } }), { contract })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.envelope.data).toEqual({ days: 99 })
  })

  it('awaits an async validator', async () => {
    const contract = trip(schema(async () => ({ value: { days: 7 } })))
    const result = await parseResponse(response({ data: {} }), { contract })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.envelope.data).toEqual({ days: 7 })
  })

  it('reports validation issues with their path', async () => {
    const contract = trip(schema(() => ({ issues: [{ message: 'days は必須', path: ['days'] }] })))
    const result = await parseResponse(response({ data: {} }), { contract })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('validation-failed')
    expect(result.issues).toEqual([{ message: 'days は必須', path: ['days'] }])
  })

  it('accepts bare JSON when allowed', async () => {
    const result = await parseResponse('はい\n{"days":3}', {
      contract: trip(),
      allowBareJson: true,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.via).toBe('bare-json')
    expect(result.value.envelope.data).toEqual({ days: 3 })
    expect(result.value.envelope.contract).toBe('trip.itinerary@1')
  })

  it('cannot use bare JSON without a contract', async () => {
    const result = await parseResponse('{"days":3}', { allowBareJson: true })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('no-envelope')
    expect(result.issues).toHaveLength(1)
  })

  it('prefers a real envelope over bare JSON', async () => {
    const text = `{"days":1}\n${response({ data: { days: 2 } })}`
    const result = await parseResponse(text, { contract: trip(), allowBareJson: true })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.via).toBe('sentinel-scan')
  })
})
