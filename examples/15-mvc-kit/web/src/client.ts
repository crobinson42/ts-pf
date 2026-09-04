import { createClient, FetchLink } from '@ts-pf/client'
import type { contract } from '@ts-pf/example-mvc-kit-contract'

export const client = createClient<typeof contract>(
  new FetchLink({ url: '/rpc' }),
)
