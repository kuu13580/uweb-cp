import type { StandardSchemaV1 } from '@standard-schema/spec'

/** LLM に渡す仕様記述。JSON Schema draft 2020-12 のサブセットを想定する。 */
export type JSONSchema = Record<string, unknown>

/** `<id>@<version>` 形式の契約参照子。封筒の contract フィールドに入る。 */
export type ContractRef = string

/**
 * アプリが「LLM から受け取りたい構造化データ」の定義。
 * jsonSchema は送信プロンプト用、validate は受信データ検証用で役割が異なる。
 */
export interface Contract<T> {
  readonly id: string
  readonly version: number
  readonly ref: ContractRef
  readonly title?: string
  readonly description?: string
  readonly jsonSchema: JSONSchema
  readonly examples?: readonly T[]
  readonly validate?: StandardSchemaV1<unknown, T>
}

export interface DefineContractInput<T> {
  id: string
  version?: number
  title?: string
  description?: string
  jsonSchema: JSONSchema
  examples?: readonly T[]
  validate?: StandardSchemaV1<unknown, T>
}

export interface Issue {
  readonly message: string
  readonly path?: ReadonlyArray<string | number>
}

export type Result<T> = { ok: true; value: T } | { ok: false; issues: readonly Issue[] }
