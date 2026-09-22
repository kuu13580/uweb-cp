import { describe, expect, it } from 'vite-plus/test'
import { ENVELOPE_VERSION, isEnvelope, isResponseEnvelope } from '../src/envelope'
import { createRid } from '../src/rid'

const response = { ucp: ENVELOPE_VERSION, kind: 'response', contract: 'idea.list@1', data: {} }
const request = { ucp: ENVELOPE_VERSION, kind: 'request', rid: 'r_1', contract: 'idea.list@1' }

describe('isEnvelope', () => {
  it('accepts both kinds at the current version', () => {
    expect(isEnvelope(response)).toBe(true)
    expect(isEnvelope(request)).toBe(true)
  })

  it('rejects another version, so a future envelope is not silently read as this one', () => {
    expect(isEnvelope({ ...response, ucp: 2 })).toBe(false)
    expect(isEnvelope({ ...response, ucp: '1' })).toBe(false)
  })

  it('rejects values that are not envelopes', () => {
    for (const value of [null, undefined, 1, 'ucp', [], {}, { ucp: 1 }, { kind: 'response' }]) {
      expect(isEnvelope(value)).toBe(false)
    }
  })

  it('rejects an unknown kind', () => {
    expect(isEnvelope({ ...response, kind: 'notification' })).toBe(false)
  })
})

describe('isResponseEnvelope', () => {
  it('narrows to responses only', () => {
    expect(isResponseEnvelope(response)).toBe(true)
    expect(isResponseEnvelope(request)).toBe(false)
  })
})

describe('createRid', () => {
  it('prefixes the id so it is recognisable in a chat log', () => {
    expect(createRid()).toMatch(/^r_[0-9a-z]{8}$/)
  })

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createRid()))
    expect(ids.size).toBe(200)
  })

  it('still produces an id without crypto.randomUUID', () => {
    const crypto = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true })
    try {
      expect(createRid()).toMatch(/^r_[0-9a-z]{8}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: crypto, configurable: true })
    }
  })
})
