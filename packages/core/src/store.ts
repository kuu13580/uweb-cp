import type { ContractRef } from './types'

export interface PendingRequest {
  rid: string
  contract: ContractRef
  createdAt: number
  context?: unknown
}

/**
 * 送信済みで応答待ちの要求を保持する。
 * Web Share Target は新規ナビゲーションで開くため sessionStorage では消える。
 * 既定実装は localStorage を使う。
 */
export interface PendingStore {
  put(request: PendingRequest): Promise<void>
  take(rid: string): Promise<PendingRequest | undefined>
  /** rid が失われた応答のためのフォールバック。contract 一致の最新を返す。 */
  latest(contract?: ContractRef): Promise<PendingRequest | undefined>
  /** 新しい順。 */
  list(): Promise<PendingRequest[]>
  prune(maxAgeMs: number): Promise<void>
}

export interface LocalStorageStoreOptions {
  namespace?: string
  /** 超えた分は古いものから捨てる。 */
  maxEntries?: number
}

const DEFAULT_NAMESPACE = 'uweb-cp'
const DEFAULT_MAX_ENTRIES = 20

/**
 * localStorage 上の実装。
 * プライベートウィンドウやサイトデータ遮断では読み書きが投げるため、
 * 使えないと分かった時点でメモリ実装に落ちる (状態は失われるが動作は続く)。
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

/** localStorage が使えない環境向けのメモリ実装。 */
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

/** 壊れた保存値は「空」として扱う。読めないだけで機能を止めない。 */
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
