import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { procedure, router } from '@ts-pf/contract'
import { MultipartCodec } from '@ts-pf/file'
import { createImplementer, createLocalClient } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    upload: procedure
      .input(z.object({ title: z.string(), photo: z.file() }))
      .output(z.object({ title: z.string(), size: z.number() })),
    download: procedure.input(z.object({ id: z.number() })).output(z.file()),
  },
})

const impl = createImplementer(contract)
const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input }) => ({
      id: input.id,
      name: 'Earth',
    })),
    upload: impl.planet.upload.handler(async ({ input }) => ({
      title: input.title,
      size: input.photo.size,
    })),
    download: impl.planet.download.handler(async () => {
      return new File(['pdf-bytes'], 'report.pdf', { type: 'application/pdf' })
    }),
  },
})

const codec = new MultipartCodec()
const handler = new FetchHandler(app, { codec })

function fetchFor(onRequest?: (req: Request) => void): typeof fetch {
  return async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    onRequest?.(req)
    const result = await handler.handle(req, { prefix: '/rpc', context: {} })
    if (!result.matched) {
      return new Response('not found', { status: 404 })
    }
    return result.response
  }
}

describe('MultipartCodec e2e', () => {
  it('uploads and downloads files', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://localhost/rpc',
        fetch: fetchFor(),
        codec,
      }),
    )
    const photo = new File(['hello'], 'earth.png', { type: 'image/png' })
    expect(await client.planet.upload({ title: 'Earth', photo })).toEqual({
      title: 'Earth',
      size: 5,
    })
    const pdf = await client.planet.download({ id: 1 })
    expect(pdf).toBeInstanceOf(File)
    expect(pdf.name).toBe('report.pdf')
    expect(await pdf.text()).toBe('pdf-bytes')
  })

  it('sends JSON for procedures without files', async () => {
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

  it('passes File through createLocalClient', async () => {
    const local = createLocalClient(app, { context: {} })
    const photo = new File(['hello'], 'earth.png', { type: 'image/png' })
    expect(await local.planet.upload({ title: 'Earth', photo })).toEqual({
      title: 'Earth',
      size: 5,
    })
    const pdf = await local.planet.download({ id: 1 })
    expect(pdf).toBeInstanceOf(File)
    expect(await pdf.text()).toBe('pdf-bytes')
  })
})
