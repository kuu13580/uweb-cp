import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { UcpErrorCode } from './errors'

/** The shape description handed to the model. Assumed to be a subset of JSON Schema draft 2020-12. */
export type JSONSchema = Record<string, unknown>

/** Contract reference, `<id>@<version>`. Carried in the envelope's contract field. */
export type ContractRef = string

/**
 * What the app wants back from the model, declared once.
 * jsonSchema describes it in the outgoing prompt; validate guards the incoming data.
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

/**
 * A failure carries one code for what went wrong, plus issues for the detail.
 * issues also appear on success as non-fatal warnings, so branch on code, never on issues.
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: UcpErrorCode; issues: readonly Issue[] }
