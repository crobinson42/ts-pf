/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { procedure, router } from '@ts-pf/contract'
import { createImplementer, createLocalClient } from '@ts-pf/server'
import { useState } from 'react'
import useSWR, { SWRConfig, useSWRConfig } from 'swr'
import useSWRMutation from 'swr/mutation'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createSwr } from '../src/create-swr.js'

const contract = router({
  planet: {
    list: procedure.output(
      z.array(z.object({ id: z.number(), name: z.string() })),
    ),
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    create: procedure
      .input(z.object({ name: z.string() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
})

type Planet = { id: number; name: string }

function createApp(planets: Planet[]) {
  const impl = createImplementer(contract)
  return impl.router({
    planet: {
      list: impl.planet.list.handler(async () => [...planets]),
      find: impl.planet.find.handler(async ({ input }) => {
        const row = planets.find((planet) => planet.id === input.id)
        if (!row) {
          throw new Error('missing')
        }
        return row
      }),
      create: impl.planet.create.handler(async ({ input }) => {
        const planet = { id: planets.length + 1, name: input.name }
        planets.push(planet)
        return planet
      }),
    },
  })
}

afterEach(() => {
  cleanup()
})

describe('SWR hooks', () => {
  it('loads a procedure with useSWR', async () => {
    const client = createLocalClient(
      createApp([
        { id: 1, name: 'Earth' },
        { id: 2, name: 'Mars' },
      ]),
      { context: {} },
    )
    const swr = createSwr(client)

    function View() {
      const { data, isLoading } = useSWR(
        swr.planet.find.key({ input: { id: 1 } }),
        swr.planet.find.fetcher(),
      )
      if (isLoading || !data) {
        return <p>loading</p>
      }
      return <p>{data.name}</p>
    }

    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <View />
      </SWRConfig>,
    )

    await waitFor(() => {
      expect(screen.getByText('Earth')).toBeTruthy()
    })
  })

  it('revalidates a list after useSWRMutation', async () => {
    const planets: Planet[] = [
      { id: 1, name: 'Earth' },
      { id: 2, name: 'Mars' },
    ]
    const client = createLocalClient(createApp(planets), { context: {} })
    const swr = createSwr(client)

    function View() {
      const { data } = useSWR(swr.planet.list.key(), swr.planet.list.fetcher())
      const { trigger, isMutating } = useSWRMutation(
        swr.planet.list.key(),
        swr.planet.create.mutator(),
      )
      return (
        <div>
          <p>{data?.map((planet) => planet.name).join(',') ?? 'loading'}</p>
          <button
            type="button"
            disabled={isMutating}
            onClick={() => {
              void trigger({ name: 'Venus' })
            }}
          >
            create
          </button>
        </div>
      )
    }

    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <View />
      </SWRConfig>,
    )

    await waitFor(() => {
      expect(screen.getByText('Earth,Mars')).toBeTruthy()
    })
    screen.getByRole('button', { name: 'create' }).click()
    await waitFor(() => {
      expect(screen.getByText('Earth,Mars,Venus')).toBeTruthy()
    })
  })

  it('invalidates children through a router matcher', async () => {
    const client = createLocalClient(createApp([{ id: 1, name: 'Earth' }]), {
      context: {},
    })
    const swr = createSwr(client)
    let loads = 0
    const fetcher = swr.planet.list.fetcher()
    const counting = async (...args: Parameters<typeof fetcher>) => {
      loads += 1
      return fetcher(...args)
    }

    function View() {
      const { mutate } = useSWRConfig()
      const { data } = useSWR(swr.planet.list.key(), counting)
      const [n, setN] = useState(0)
      return (
        <div>
          <p>{data ? `count:${loads}` : 'loading'}</p>
          <button
            type="button"
            onClick={() => {
              void mutate(swr.planet.matcher())
              setN((value) => value + 1)
            }}
          >
            invalidate {n}
          </button>
        </div>
      )
    }

    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <View />
      </SWRConfig>,
    )

    await waitFor(() => {
      expect(screen.getByText('count:1')).toBeTruthy()
    })
    screen.getByRole('button', { name: /invalidate/ }).click()
    await waitFor(() => {
      expect(screen.getByText('count:2')).toBeTruthy()
    })
  })
})
