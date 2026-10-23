/**
 * `T` with every key that may be `undefined` made optional and narrowed, and
 * every other key kept as is. The static shape of `defined(obj)`.
 */
export type Defined<T extends object> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
    T[K],
    undefined
  >
}

/**
 * Shallow copy of `obj` without the own enumerable string keys whose value is
 * `undefined`. Under `exactOptionalPropertyTypes` an option bag may not carry
 * `signal: undefined` where `signal?: AbortSignal` is declared, so forwarding
 * optional fields becomes `{ ...required, ...defined({ signal, headers }) }`
 * instead of one `...(x ? { x } : {})` spread per field.
 */
export function defined<T extends object>(obj: T): Defined<T> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key]
    if (value !== undefined) {
      out[key] = value
    }
  }
  return out as Defined<T>
}
