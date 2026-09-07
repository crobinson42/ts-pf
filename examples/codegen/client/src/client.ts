import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { Contract } from './contract.js'

export function createPlanetClient(fetchImpl: typeof fetch) {
  return createClient<Contract>(
    new FetchLink({ url: 'http://127.0.0.1/rpc', fetch: fetchImpl }),
  )
}
