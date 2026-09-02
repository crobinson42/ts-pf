import { createClient, FetchLink } from '@ts-pf/client'
import type { contract } from '@ts-pf/example-workshop-contract'
import { SseCodec } from '@ts-pf/sse'

const codec = new SseCodec()

export const client = createClient<typeof contract>(
  new FetchLink({
    url: '/rpc',
    codec,
    interceptors: [
      async ({ request, next }) => {
        const token = localStorage.getItem('token') ?? 'demo'
        request.headers.set('authorization', `Bearer ${token}`)
        return next(request)
      },
    ],
  }),
)
