import type { ContractRef } from './types'

export interface PendingRequest {
  rid: string
  contract: ContractRef
  createdAt: number
  context?: unknown
}

/**
 * Holds requests that have been sent and are waiting for a reply.
 * Web Share Target opens as a fresh navigation, which wipes sessionStorage, so the default
 * implementation uses localStorage.
 */
export interface PendingStore {
  put(request: PendingRequest): Promise<void>
  take(rid: string): Promise<PendingRequest | undefined>
  /** Fallback for a reply that lost its rid: the newest request matching the contract. */
  latest(contract?: ContractRef): Promise<PendingRequest | undefined>
  /** Newest first. */
  list(): Promise<PendingRequest[]>
  prune(maxAgeMs: number): Promise<void>
}

export interface LocalStorageStoreOptions {
  namespace?: string
  /** Entries beyond this are dropped, oldest first. */
  maxEntries?: number
}

const DEFAULT_NAMESPACE = 'uweb-cp'
const DEFAULT_MAX_ENTRIES = 20

/**
 * The localStorage-backed implementation.
 * A private window or blocked site data makes reads and writes throw, so the moment it turns
 * out to be unusable this falls back to the in-memory store: state is lost, behaviour is not.
 */
export function createLocalStorageStore(options: LocalStorageStoreOptions = {}): PendingStore {
  const key = `${options.namespace ?? DEFAULT_NAMESPACE}:pending`
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const fallback = createMemoryStore()
  let degraded = false

  const read = (): PendingRequest[] | undefined => {
    if (degraded) return undefined
    try {
      const raw = globalThis.localStorage.getItem(key)
      return raw === null ? [] : toRequests(raw)
    } catch {
      degraded = true
      return undefined
    }
  }

  const write = (entries: readonly PendingRequest[]): boolean => {
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(entries.slice(-maxEntries)))
      return true
    } catch {
      degraded = true
      return false
    }
  }

  return {
    put(request) {
      const entries = read()
      if (!entries || !write([...entries.filter((e) => e.rid !== request.rid), request])) {
        return fallback.put(request)
      }
      return Promise.resolve()
    },

    take(rid) {
      const entries = read()
      if (!entries) return fallback.take(rid)

      const found = entries.find((e) => e.rid === rid)
      if (found) write(entries.filter((e) => e.rid !== rid))
      return Promise.resolve(found)
    },

    latest(contract) {
      const entries = read()
      if (!entries) return fallback.latest(contract)
      return Promise.resolve(newest(entries, contract))
    },

    list() {
      const entries = read()
      if (!entries) return fallback.list()
      return Promise.resolve(byNewest(entries))
    },

    prune(maxAgeMs) {
      const entries = read()
      if (!entries) return fallback.prune(maxAgeMs)

      const threshold = Date.now() - maxAgeMs
      write(entries.filter((e) => e.createdAt >= threshold))
      return Promise.resolve()
    },
  }
}

/** In-memory implementation, for environments without a usable localStorage. */
export function createMemoryStore(): PendingStore {
  let entries: PendingRequest[] = []

  return {
    put(request) {
      entries = [...entries.filter((e) => e.rid !== request.rid), request]
      return Promise.resolve()
    },

    take(rid) {
      const found = entries.find((e) => e.rid === rid)
      entries = entries.filter((e) => e.rid !== rid)
      return Promise.resolve(found)
    },

    latest(contract) {
      return Promise.resolve(newest(entries, contract))
    },

    list() {
      return Promise.resolve(byNewest(entries))
    },

    prune(maxAgeMs) {
      const threshold = Date.now() - maxAgeMs
      entries = entries.filter((e) => e.createdAt >= threshold)
      return Promise.resolve()
    },
  }
}

function byNewest(entries: readonly PendingRequest[]): PendingRequest[] {
  return entries.toSorted((a, b) => b.createdAt - a.createdAt)
}

function newest(
  entries: readonly PendingRequest[],
  contract?: ContractRef,
): PendingRequest | undefined {
  const scoped = contract ? entries.filter((e) => e.contract === contract) : entries
  return byNewest(scoped).at(0)
}

/** A corrupted stored value counts as empty. Being unable to read it must not stop anything. */
function toRequests(raw: string): PendingRequest[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  return Array.isArray(parsed) ? parsed.filter(isPendingRequest) : []
}

function isPendingRequest(value: unknown): value is PendingRequest {
  if (typeof value !== 'object' || value === null) return false
  if (!('rid' in value) || !('contract' in value) || !('createdAt' in value)) return false
  return (
    typeof value.rid === 'string' &&
    typeof value.contract === 'string' &&
    typeof value.createdAt === 'number'
  )
}
