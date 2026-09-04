import type { SwrKey, SwrKeyInit } from './types.js'

export function generateSwrKey(
  path: readonly string[],
  prefix?: string,
  input?: unknown,
): SwrKey {
  const init: SwrKeyInit = input !== undefined ? { input } : ({} as SwrKeyInit)
  return prefix !== undefined ? [prefix, path, init] : [path, init]
}

export function inputFromKey(key: SwrKey): unknown {
  const last = key[key.length - 1]
  if (typeof last === 'object' && last !== null && 'input' in last) {
    return last.input
  }
  return undefined
}
