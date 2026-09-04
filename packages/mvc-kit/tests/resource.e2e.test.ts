import type { ContractClient } from '@ts-pf/contract'
import { procedure, router } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import { createImplementer, createLocalClient } from '@ts-pf/server'
import { Resource } from 'mvc-kit'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { bindClient } from '../src/bind-client.js'

const planet = z.object({ id: z.number(), name: z.string() })

const contract = router({
  planet: {
    list: procedure.output(z.array(planet)),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(planet)
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
  },
})

const impl = createImplementer(contract)
const app = impl.router({
  planet: {
    list: impl.planet.list.handler(async () => [
      { id: 1, name: 'Earth' },
      { id: 2, name: 'Mars' },
    ]),
    find: impl.planet.find.handler(async ({ input, errors }) => {
      if (input.id === 1) {
        return { id: 1, name: 'Earth' }
      }
      throw errors.NOT_FOUND({ id: input.id })
    }),
  },
})

type Planet = { id: number; name: string }

class PlanetsResource extends Resource<Planet> {
  private rpc: ContractClient<typeof contract>

  constructor(client: ContractClient<typeof contract>) {
    super()
    this.rpc = bindClient(client, this)
  }

  async loadAll() {
    this.reset(await this.rpc.planet.list())
  }

  async loadById(id: number) {
    this.upsert(await this.rpc.planet.find({ id }))
  }
}

describe('bindClient + Resource', () => {
  it('loads a list through a Resource', async () => {
    const client = createLocalClient(app, { context: {} })
    const resource = new PlanetsResource(client)
    resource.init()
    await resource.loadAll()
    expect(resource.items).toEqual([
      { id: 1, name: 'Earth' },
      { id: 2, name: 'Mars' },
    ])
  })

  it('surfaces NOT_FOUND on async.errorCode with PFError cause', async () => {
    const client = createLocalClient(app, { context: {} })
    const resource = new PlanetsResource(client)
    resource.init()
    await expect(resource.loadById(999)).rejects.toBeInstanceOf(PFError)
    expect(resource.async.loadById.errorCode).toBe('NOT_FOUND')
    expect(resource.async.loadById.errorCode).not.toBe('not_found')
    const cause = resource.async.loadById.cause
    expect(cause).toBeInstanceOf(PFError)
    expect((cause as PFError).data).toEqual({ id: 999 })
  })

  it('swallows FetchLink-shaped abort and does not set async.error', async () => {
    const hang = vi.fn((_opts?: { signal?: AbortSignal }) => {
      const signal = _opts?.signal
      return new Promise<Planet[]>((_, reject) => {
        const fail = () => {
          const abort = new Error('aborted')
          abort.name = 'AbortError'
          reject(
            new PFError({
              code: 'INTERNAL',
              status: 0,
              message: 'Request aborted',
              cause: abort,
            }),
          )
        }
        if (signal?.aborted) {
          fail()
          return
        }
        signal?.addEventListener('abort', fail)
      })
    })
    const client = { planet: { list: hang } }

    class HangResource extends Resource<Planet> {
      private rpc: typeof client

      constructor() {
        super()
        this.rpc = bindClient(client as never, this) as typeof client
      }

      async loadAll() {
        this.reset(await this.rpc.planet.list())
      }
    }

    const resource = new HangResource()
    resource.init()
    const pending = resource.loadAll()
    resource.dispose()
    await expect(pending).resolves.toBeUndefined()
    expect(resource.async.loadAll.error).toBe(null)
    expect(resource.async.loadAll.errorCode).toBe(null)
  })
})
