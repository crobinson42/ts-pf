import { asResult, createClient, FetchLink } from '@ts-pf/client'
import { createLocalClient } from '@ts-pf/server'
import { fetchFor } from 'ts-pf-example-shared/test-fetch'
import { describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import type { contract } from '../src/contract.js'
import { createDb } from '../src/db.js'
import { handler } from '../src/server.js'

describe('03-middleware', () => {
  it('createLocalClient runs middleware without HTTP', async () => {
    const db = createDb()
    const authed = createLocalClient(app, {
      context: { db, user: { id: 1 } },
    })
    expect(await authed.planet.create({ name: 'Venus' })).toEqual({
      id: 2,
      name: 'Venus',
    })

    const anon = createLocalClient(app, { context: { db } })
    await expect(anon.planet.create({ name: 'Nope' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('keeps list public over HTTP and protects create', async () => {
    const client = createClient<typeof contract>(
      new FetchLink({
        url: 'http://127.0.0.1/rpc',
        fetch: fetchFor(handler, (req) => ({
          db: createDb(),
          ...(req.headers.get('authorization') === 'Bearer demo'
            ? { user: { id: 1 } }
            : {}),
        })),
      }),
    )

    expect(await client.planet.list()).toEqual([{ id: 1, name: 'Earth' }])

    const denied = await asResult(client.planet.create({ name: 'Nope' }))
    expect(denied.ok).toBe(false)
    if (!denied.ok) {
      expect(denied.error.code).toBe('UNAUTHORIZED')
    }
  })
})
