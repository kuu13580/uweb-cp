import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  createLocalStorageStore,
  createMemoryStore,
  type PendingRequest,
  type PendingStore,
} from '../src/store'

const req = (rid: string, overrides: Partial<PendingRequest> = {}): PendingRequest => ({
  rid,
  contract: 'trip.itinerary@1',
  createdAt: 1_000,
  ...overrides,
})

const KEY = 'uweb-cp:pending'

describe.each([
  ['memory', () => createMemoryStore()],
  ['localStorage', () => createLocalStorageStore()],
])('%s store', (_name, create) => {
  let store: PendingStore

  beforeEach(() => {
    globalThis.localStorage.clear()
    store = create()
  })

  it('takes a request back by rid and removes it', async () => {
    await store.put(req('r1'))

    expect(await store.take('r1')).toMatchObject({ rid: 'r1' })
    expect(await store.take('r1')).toBeUndefined()
  })

  it('returns undefined for an unknown rid', async () => {
    expect(await store.take('nope')).toBeUndefined()
  })

  it('replaces an entry with the same rid', async () => {
    await store.put(req('r1', { createdAt: 1 }))
    await store.put(req('r1', { createdAt: 2 }))

    expect(await store.list()).toHaveLength(1)
    expect(await store.take('r1')).toMatchObject({ createdAt: 2 })
  })

  it('lists newest first', async () => {
    await store.put(req('old', { createdAt: 1 }))
    await store.put(req('new', { createdAt: 9 }))

    expect((await store.list()).map((e) => e.rid)).toEqual(['new', 'old'])
  })

  it('finds the newest entry of a contract', async () => {
    await store.put(req('a', { createdAt: 1 }))
    await store.put(req('b', { createdAt: 5 }))
    await store.put(req('other', { contract: 'other@1', createdAt: 9 }))

    expect(await store.latest('trip.itinerary@1')).toMatchObject({ rid: 'b' })
    expect(await store.latest()).toMatchObject({ rid: 'other' })
    expect(await store.latest('missing@1')).toBeUndefined()
  })

  it('prunes entries older than the given age', async () => {
    const now = Date.now()
    await store.put(req('fresh', { createdAt: now }))
    await store.put(req('stale', { createdAt: now - 10_000 }))

    await store.prune(5_000)

    expect((await store.list()).map((e) => e.rid)).toEqual(['fresh'])
  })

  it('keeps the context payload', async () => {
    await store.put(req('r1', { context: { destination: '金沢' } }))
    expect(await store.take('r1')).toMatchObject({ context: { destination: '金沢' } })
  })
})

describe('createLocalStorageStore', () => {
  beforeEach(() => {
    globalThis.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('survives a corrupt stored value', async () => {
    globalThis.localStorage.setItem(KEY, 'not json')
    const store = createLocalStorageStore()

    expect(await store.list()).toEqual([])
    await store.put(req('r1'))
    expect(await store.take('r1')).toMatchObject({ rid: 'r1' })
  })

  it('drops stored entries that are not requests', async () => {
    globalThis.localStorage.setItem(KEY, JSON.stringify([{ nope: true }, req('r1')]))
    expect(await createLocalStorageStore().list()).toHaveLength(1)
  })

  it('honours the namespace', async () => {
    const store = createLocalStorageStore({ namespace: 'demo' })
    await store.put(req('r1'))

    expect(globalThis.localStorage.getItem('demo:pending')).toContain('r1')
    expect(globalThis.localStorage.getItem(KEY)).toBeNull()
  })

  it('drops the oldest entries beyond maxEntries', async () => {
    const store = createLocalStorageStore({ maxEntries: 2 })
    await store.put(req('a', { createdAt: 1 }))
    await store.put(req('b', { createdAt: 2 }))
    await store.put(req('c', { createdAt: 3 }))

    expect((await store.list()).map((e) => e.rid)).toEqual(['c', 'b'])
  })

  it('falls back to memory when storage throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })

    const store = createLocalStorageStore()
    await store.put(req('r1'))

    expect(await store.take('r1')).toMatchObject({ rid: 'r1' })
  })
})
