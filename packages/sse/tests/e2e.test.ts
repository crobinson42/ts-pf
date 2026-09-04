import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { procedure, router } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import { createImplementer, createLocalClient } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { SSE_CONTENT_TYPE, SseCodec } from '@ts-pf/sse'
import { StreamCodec, stream } from '@ts-pf/stream'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    chat: procedure
      .input(z.object({ prompt: z.string() }))
      .output(stream(z.object({ token: z.string() }))),
    ingest: procedure
      .input(stream(z.object({ chunk: z.number() })))
      .output(z.object({ count: z.number() })),
    boom: procedure.output(stream(z.object({ token: z.string() }))),
    hold: procedure.output(stream(z.object({ token: z.string() }))),
  },
})

const impl = createImplementer(contract)
const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input }) => ({
      id: input.id,
      name: 'Earth',
    })),
    chat: impl.planet.chat.handler(async function* ({ input, signal }) {
      yield { token: input.prompt.slice(0, 1) }
      if (signal?.aborted) {
        return
      }
      yield { token: input.prompt.slice(1) }
    }),
    ingest: impl.planet.ingest.handler(async ({ input }) => {
      let count = 0
      for await (const item of input) {
        count += item.chunk
      }
      return { count }
    }),
    boom: impl.planet.boom.handler(async function* () {
      yield { token: 'Hel' }
      throw new PFError({
        code: 'INTERNAL',
        status: 500,
        message: 'upstream died',
      })
    }),
    hold: impl.planet.hold.handler(async function* ({ signal }) {
      yield { token: 'a' }
      await new Promise<void>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason)
          return
        }
        signal?.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      })
    }),
  },
})

const codec = new SseCodec({ keepAliveMs: 0 })
const handler = new FetchHandler(app, { codec })

function fetchFor(
  onRequest?: (req: Request) => void,
  onResponse?: (res: Response) => void,
): typeof fetch {
  return async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    onRequest?.(req)
    const result = await handler.handle(req, { prefix: '/rpc', context: {} })
    if (!result.matched) {
      return new Response('not found', { status: 404 })
    }
    const response = result.response
    const abortBody = (): void => {
      const body = response.body
      if (!body || body.locked) {
        return
      }
      void body.cancel().catch(() => {})
    }
    if (req.signal.aborted) {
      abortBody()
    } else {
      req.signal.addEventListener('abort', abortBody, { once: true })
    }
    onResponse?.(response)
    return response
  }
}

describe('SseCodec e2e', () => {
  it('streams output tokens over SSE', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor(),
        codec,
      }),
    )
    const tokens = await client.planet.chat({ prompt: 'Hi' })
    const collected: { token: string }[] = []
    for await (const token of tokens) {
      collected.push(token)
    }
    expect(collected).toEqual([{ token: 'H' }, { token: 'i' }])
  })

  it('sets SSE content-type on stream output', async () => {
    let type = ''
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor(undefined, (res) => {
          type = res.headers.get('content-type') ?? ''
        }),
        codec,
      }),
    )
    const tokens = await client.planet.chat({ prompt: 'Hi' })
    for await (const token of tokens) {
      void token
    }
    expect(type).toBe(SSE_CONTENT_TYPE)
  })

  it('streams input chunks as JSONL', async () => {
    const types: string[] = []
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor((req) => {
          types.push(req.headers.get('content-type') ?? '')
        }),
        codec,
      }),
    )
    async function* chunks() {
      yield { chunk: 1 }
      yield { chunk: 2 }
    }
    expect(await client.planet.ingest(chunks())).toEqual({ count: 3 })
    expect(types[0]).toBe('application/jsonl')
  })

  it('sends JSON for procedures without streams', async () => {
    const types: string[] = []
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor((req) => {
          types.push(req.headers.get('content-type') ?? '')
        }),
        codec,
      }),
    )
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
    expect(types[0]?.startsWith('application/json')).toBe(true)
  })

  it('accepts a JSON-only client for JSON procedures', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor(),
      }),
    )
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
  })

  it('surfaces in-band errors from event: error', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor(undefined, (res) => {
          expect(res.status).toBe(200)
        }),
        codec,
      }),
    )
    const tokens = await client.planet.boom()
    const iter = tokens[Symbol.asyncIterator]()
    expect(await iter.next()).toEqual({
      done: false,
      value: { token: 'Hel' },
    })
    await expect(iter.next()).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'upstream died',
    })
  })

  it('lets an SseCodec client read StreamCodec JSONL output', async () => {
    const jsonlHandler = new FetchHandler(app, { codec: new StreamCodec() })
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: async (input, init) => {
          const req =
            input instanceof Request ? input : new Request(input, init)
          const result = await jsonlHandler.handle(req, {
            prefix: '/rpc',
            context: {},
          })
          if (!result.matched) {
            return new Response('not found', { status: 404 })
          }
          return result.response
        },
        codec,
      }),
    )
    const tokens = await client.planet.chat({ prompt: 'Hi' })
    const collected: { token: string }[] = []
    for await (const token of tokens) {
      collected.push(token)
    }
    expect(collected).toEqual([{ token: 'H' }, { token: 'i' }])
  })

  it('rejects a StreamCodec client against SSE output', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor(),
        codec: new StreamCodec(),
      }),
    )
    await expect(client.planet.chat({ prompt: 'Hi' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('aborts a live stream when the call signal aborts', async () => {
    const controller = new AbortController()
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor(),
        codec,
      }),
    )
    const tokens = await client.planet.hold({ signal: controller.signal })
    const iter = tokens[Symbol.asyncIterator]()
    expect(await iter.next()).toEqual({
      done: false,
      value: { token: 'a' },
    })
    controller.abort()
    await expect(iter.next()).rejects.toThrow()
  })

  it('passes a live generator through createLocalClient', async () => {
    const local = createLocalClient(app, { context: {} })
    const tokens = await local.planet.chat({ prompt: 'Hi' })
    const collected: { token: string }[] = []
    for await (const token of tokens) {
      collected.push(token)
    }
    expect(collected).toEqual([{ token: 'H' }, { token: 'i' }])
  })
})
