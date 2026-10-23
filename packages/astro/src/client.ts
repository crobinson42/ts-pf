import {
  type CallInterceptor,
  type CallPlugin,
  createClient,
} from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { ContractClient } from '@ts-pf/contract'
import { defined } from '@ts-pf/protocol'

type FetchLinkOptions = ConstructorParameters<typeof FetchLink>[0]

type AstroClientOptions = {
  prefix: string
  headers?: NonNullable<FetchLinkOptions['headers']>
  fetch?: NonNullable<FetchLinkOptions['fetch']>
  codec?: NonNullable<FetchLinkOptions['codec']>
  plugins?: readonly CallPlugin[]
  interceptors?: readonly CallInterceptor[]
}

/**
 * Browser / island client. Pass the contract type:
 * `createAstroClient<typeof contract>({ prefix })`. Without it `T` is `never`
 * and the result is a single `~error` member naming the fix (same rule as
 * `createClient`).
 */
export function createAstroClient<T = never>(
  opts: AstroClientOptions,
): [T] extends [never]
  ? { readonly '~error': 'Pass createAstroClient<typeof contract>({ prefix })' }
  : ContractClient<T>
export function createAstroClient(opts: AstroClientOptions): unknown {
  const link = new FetchLink(fetchLinkOptions(opts))
  const clientOpts = clientOptions(opts)
  return clientOpts
    ? createClient<unknown>(link, clientOpts)
    : createClient<unknown>(link)
}

function fetchLinkOptions(opts: {
  prefix: string
  headers?: NonNullable<FetchLinkOptions['headers']>
  fetch?: NonNullable<FetchLinkOptions['fetch']>
  codec?: NonNullable<FetchLinkOptions['codec']>
}): FetchLinkOptions {
  return {
    url: opts.prefix,
    ...defined({ headers: opts.headers, fetch: opts.fetch, codec: opts.codec }),
  }
}

function clientOptions(opts: {
  plugins?: readonly CallPlugin[]
  interceptors?: readonly CallInterceptor[]
}):
  | {
      plugins?: readonly CallPlugin[]
      interceptors?: readonly CallInterceptor[]
    }
  | undefined {
  const clientOpts = defined({
    plugins: opts.plugins,
    interceptors: opts.interceptors,
  })
  return Object.keys(clientOpts).length === 0 ? undefined : clientOpts
}

export { withBase } from './with-base.js'
