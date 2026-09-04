import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { ContractClient } from '@ts-pf/contract'
import { StreamCodec } from '@ts-pf/stream'
import type { contract } from './contract.js'

export function createPlanetClient(
  fetchImpl: typeof fetch,
): ContractClient<typeof contract> {
  return createClient(
    new FetchLink({
      url: 'http://127.0.0.1/rpc',
      fetch: fetchImpl,
      codec: new StreamCodec(),
    }),
  )
}
