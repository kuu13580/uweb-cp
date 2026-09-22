/**
 * Helpers for reading properties and methods off unknown values.
 *
 * Feature detection deals with things the type system knows about but the runtime may
 * not ship, so we touch them instead of asserting they exist.
 */

export function getProp(target: unknown, name: string): unknown {
  if (typeof target !== 'object' || target === null) return undefined
  return Reflect.get(target, name)
}

export function hasMethod(target: unknown, name: string): boolean {
  return typeof getProp(target, name) === 'function'
}

export function isTrue(target: unknown, name: string): boolean {
  return getProp(target, name) === true
}

/** Returns undefined when the method is missing, otherwise whatever the call returned. */
export function callMethod(target: unknown, name: string, args: readonly unknown[]): unknown {
  const method = getProp(target, name)
  if (typeof method !== 'function') return undefined
  return Reflect.apply(method, target, args)
}
