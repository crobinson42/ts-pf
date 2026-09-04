import type { CallInterceptor } from './call-interceptor.js'

export type CallPlugin = {
  readonly name: string
  readonly intercept: CallInterceptor
}

export function applyPlugins(
  plugins: readonly CallPlugin[],
  interceptors?: readonly CallInterceptor[],
): CallInterceptor[] {
  return [...plugins.map((plugin) => plugin.intercept), ...(interceptors ?? [])]
}
