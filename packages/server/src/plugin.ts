import type { CallInterceptor } from './call-interceptor.js'

export type CallPlugin = {
  readonly name: string
  readonly intercept: CallInterceptor
}

/**
 * Flattens plugins and loose interceptors into one interceptor list: every
 * plugin's `intercept` first, in array order, then `interceptors` in array
 * order. `[0]` is the outermost wrapper, so plugins run outside loose
 * interceptors and the first plugin sees the call first and its result last.
 */
export function applyPlugins(
  plugins: readonly CallPlugin[],
  interceptors?: readonly CallInterceptor[],
): CallInterceptor[] {
  return [...plugins.map((plugin) => plugin.intercept), ...(interceptors ?? [])]
}
