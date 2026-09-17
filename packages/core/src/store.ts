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
  list(): Promise<PendingRequest[]>
  prune(maxAgeMs: number): Promise<void>
}

export interface LocalStorageStoreOptions {
  namespace?: string
  maxEntries?: number
}

/** TODO: 実装。 */
export function createLocalStorageStore(_options?: LocalStorageStoreOptions): PendingStore {
  throw new Error('not implemented')
}

/** TODO: 実装。localStorage が使えない環境向けのメモリ実装。 */
export function createMemoryStore(): PendingStore {
  throw new Error('not implemented')
}
