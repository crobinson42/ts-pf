import { createImplementer } from '@ts-pf/server'
import { contract } from './contract.js'

type Planet = { id: number; name: string }

const seed: Planet[] = [
  { id: 1, name: 'Earth' },
  { id: 2, name: 'Mars' },
]

const planets: Planet[] = [...seed]
let nextId = 3

export type AppContext = {
  requestId: string
}

export const runtime = {
  findDelayMs: 0,
  hits: { find: 0, list: 0, create: 0 },
  reset() {
    this.findDelayMs = 0
    this.hits.find = 0
    this.hits.list = 0
    this.hits.create = 0
    planets.length = 0
    planets.push(...seed)
    nextId = 3
  },
}

const impl = createImplementer(contract).$context<AppContext>()

export const app = impl.router({
  planet: {
    list: impl.planet.list.handler(async () => {
      runtime.hits.list += 1
      return planets
    }),
    find: impl.planet.find.handler(async ({ input, errors, signal }) => {
      runtime.hits.find += 1
      if (runtime.findDelayMs > 0) {
        await delay(runtime.findDelayMs, signal)
      }
      const row = planets.find((planet) => planet.id === input.id)
      if (!row) {
        throw errors.NOT_FOUND({ id: input.id })
      }
      return row
    }),
    create: impl.planet.create.handler(async ({ input }) => {
      runtime.hits.create += 1
      const planet = { id: nextId, name: input.name }
      nextId += 1
      planets.push(planet)
      return planet
    }),
  },
})

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new Error('aborted'))
    }
    if (!signal) {
      return
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
