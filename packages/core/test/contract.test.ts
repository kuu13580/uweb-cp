import { describe, expect, it } from 'vitest'
import { defineContract } from '../src/contract'

describe('defineContract', () => {
  it('builds a ref from id and version', () => {
    const c = defineContract({ id: 'trip.itinerary', version: 1, jsonSchema: { type: 'object' } })
    expect(c.ref).toBe('trip.itinerary@1')
  })

  it('defaults version to 1', () => {
    const c = defineContract({ id: 'trip.itinerary', jsonSchema: { type: 'object' } })
    expect(c.version).toBe(1)
    expect(c.ref).toBe('trip.itinerary@1')
  })
})
