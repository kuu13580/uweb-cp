import { callMethod } from './reflect'

/**
 * Correlation id. Kept short because the model has to copy it out by hand.
 * Collisions only matter inside one user's pending list, so this length is enough.
 */
export function createRid(): string {
  const uuid = callMethod(globalThis.crypto, 'randomUUID', [])
  if (typeof uuid === 'string') return `r_${uuid.replaceAll('-', '').slice(0, 8)}`
  return `r_${Math.random().toString(36).slice(2, 10)}`
}
