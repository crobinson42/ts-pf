import { createClient, FetchLink } from '@ts-pf/client'
import type { contract } from '@ts-pf/example-swr-contract'
import { createSwr } from '@ts-pf/swr'

export const client = createClient<typeof contract>(
  new FetchLink({ url: '/rpc' }),
)

export const swr = createSwr(client)
