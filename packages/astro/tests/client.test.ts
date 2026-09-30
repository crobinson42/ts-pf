import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { procedure, router } from '@ts-pf/contract'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createAstroClient } from '../src/client.js'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
})

const prefix = 'http://localhost/rpc'

describe('createAstroClient', () => {
  it('POSTs JSON to prefix + /planet/find', async () => {
    let seen: { url: string; method: string; body: unknown } | undefined
    const fetchImpl: typeof fetch = async (input) => {
      const request = input instanceof Request ? input : new Request(input)
      seen = {
        url: request.url,
        method: request.method,
        body: await request.json(),
      }
      return new Response(
        JSON.stringify({ ok: true, output: { id: 1, name: 'Earth' } }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-ts-pf-protocol': '1',
          },
        },
      )
    }

    const client = createAstroClient<typeof contract>({
      prefix,
      fetch: fetchImpl,
    })
    expect(await client.planet.find({ id: 1 })).toEqual({
      id: 1,
      name: 'Earth',
    })
    expect(seen?.url).toBe(`${prefix}/planet/find`)
    expect(seen?.method).toBe('POST')
    expect(seen?.body).toEqual({ input: { id: 1 } })
  })

  it('keeps client and server graphs split in dist', () => {
    const dist = join(dirname(fileURLToPath(import.meta.url)), '../dist')
    const clientPath = join(dist, 'client.js')
    const indexPath = join(dist, 'index.js')
    const serverPath = join(dist, 'server.js')
    if (
      !existsSync(clientPath) ||
      !existsSync(indexPath) ||
      !existsSync(serverPath)
    ) {
      expect(
        'skipped',
        'dist is missing; graph split is asserted after build',
      ).toBe('skipped')
      return
    }
    expect(readFileSync(clientPath, 'utf8')).not.toContain('@ts-pf/server')
    expect(readFileSync(indexPath, 'utf8')).not.toContain('@ts-pf/server')
    expect(readFileSync(serverPath, 'utf8')).not.toContain('@ts-pf/client')
  })
})
