import {
  CachePlugin,
  type CallInterceptor,
  type CallPlugin,
  createClient,
  DedupePlugin,
  onError,
  onStart,
  RetryPlugin,
} from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { ContractClient } from '@ts-pf/contract'
import type { contract } from './contract.js'
import { readKey } from './read-key.js'
import { TimeoutPlugin } from './timeout-plugin.js'

export const clientLog: string[] = []

export function defaultPlugins(): CallPlugin[] {
  return [
    new TimeoutPlugin(5_000),
    new CachePlugin({ ttl: 5_000, key: readKey }),
    new DedupePlugin({ key: readKey }),
    new RetryPlugin({ retries: 2 }),
  ]
}

export function defaultInterceptors(): CallInterceptor[] {
  return [
    onStart(({ path }) => {
      clientLog.push(`start ${path.join('.')}`)
    }),
    onError(({ path }) => {
      clientLog.push(`error ${path.join('.')}`)
    }),
  ]
}

export function createPlanetClient(
  fetchImpl: typeof fetch,
  options: {
    plugins?: readonly CallPlugin[]
    interceptors?: readonly CallInterceptor[]
  } = {},
): ContractClient<typeof contract> {
  return createClient(
    new FetchLink({ url: 'http://127.0.0.1/rpc', fetch: fetchImpl }),
    {
      plugins: options.plugins ?? defaultPlugins(),
      interceptors: options.interceptors ?? defaultInterceptors(),
    },
  )
}
