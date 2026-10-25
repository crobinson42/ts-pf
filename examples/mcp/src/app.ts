import { PFError } from '@ts-pf/protocol'
import { createImplementer } from '@ts-pf/server'
import { contract } from './contract.js'

export type AppCtx = { workspaceId: string; scopes: string[] }

type Planet = {
  id: number
  name: string
  moons: number
  discoveredBy: string | null
}

const seed = (): Planet[] => [
  { id: 1, name: 'Mercury', moons: 0, discoveredBy: null },
  { id: 2, name: 'Earth', moons: 1, discoveredBy: null },
  { id: 3, name: 'Neptune', moons: 16, discoveredBy: 'Le Verrier' },
]
const workspaces = new Map<string, Planet[]>()
const planetsOf = (workspaceId: string) => {
  let planets = workspaces.get(workspaceId)
  if (!planets) {
    planets = seed()
    workspaces.set(workspaceId, planets)
  }
  return planets
}

const impl = createImplementer(contract).$context<AppCtx>()

// Enforcement lives in middleware, exactly as over HTTP; MCP annotations are hints.
const requireAdmin = impl.middleware(({ context, next }) => {
  if (!context.scopes.includes('admin')) {
    throw new PFError({
      code: 'FORBIDDEN',
      message: 'Requires the admin scope',
    })
  }
  return next()
})

export const app = impl.router({
  planet: {
    list: impl.planet.list.handler(({ input }) => planetsOf(input.workspaceId)),
    find: impl.planet.find.handler(({ input, errors }) => {
      const planet = planetsOf(input.workspaceId).find((p) => p.id === input.id)
      if (!planet) throw errors.NOT_FOUND({ id: input.id })
      return planet
    }),
    rename: impl.planet.rename.handler(({ input }) => {
      const planet = planetsOf(input.workspaceId).find((p) => p.id === input.id)
      if (!planet) {
        throw new PFError({ code: 'NOT_FOUND', message: 'No such planet' })
      }
      planet.name = input.name
      return planet
    }),
    remove: impl.planet.remove.use(requireAdmin).handler(({ input }) => {
      const planets = planetsOf(input.workspaceId)
      const index = planets.findIndex((p) => p.id === input.id)
      if (index >= 0) planets.splice(index, 1)
      return { removed: index >= 0 }
    }),
  },
  ops: {
    stats: impl.ops.stats.handler(({ input }) => {
      const planets = planetsOf(input.workspaceId)
      return {
        planets: planets.length,
        moons: planets.reduce((sum, p) => sum + p.moons, 0),
      }
    }),
  },
})
