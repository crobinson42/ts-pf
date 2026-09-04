/** Cache and dedupe `planet.find` only. Writes must not share in-flight work. */
export function readKey(ctx: {
  path: string[]
  input: unknown
}): string | undefined {
  if (ctx.path.join('.') !== 'planet.find') {
    return undefined
  }
  try {
    return JSON.stringify([ctx.path, ctx.input])
  } catch {
    return undefined
  }
}
