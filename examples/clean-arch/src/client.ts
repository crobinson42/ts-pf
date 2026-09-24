import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import type { ContractClient } from '@ts-pf/contract'
import type { contract } from '@ts-pf/example-clean-arch-api/contract'
import { type WebSocketLike, WsLink } from '@ts-pf/message-client'
import { StreamCodec } from '@ts-pf/stream'

export function createHttpClient(
  fetchImpl: typeof fetch,
  headers?: HeadersInit,
): ContractClient<typeof contract> {
  return createClient(
    new FetchLink({
      url: 'http://127.0.0.1/rpc',
      fetch: fetchImpl,
      codec: new StreamCodec(),
      ...(headers ? { headers } : {}),
    }),
  )
}

export function createWsClient(socket: WebSocketLike): {
  client: ContractClient<typeof contract>
  close: () => void
} {
  const link = new WsLink({ socket })
  return { client: createClient(link), close: () => link.close() }
}
