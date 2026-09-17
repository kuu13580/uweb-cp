import type { Contract, DefineContractInput } from './types'

export function defineContract<T>(input: DefineContractInput<T>): Contract<T> {
  const version = input.version ?? 1
  return {
    ...input,
    version,
    ref: `${input.id}@${version}`,
  }
}
