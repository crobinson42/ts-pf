import { PFError } from '@ts-pf/protocol'
import { createImplementer } from '@ts-pf/server'
import { contract } from './contract.js'

export type Planet = { id: number; name: string }

export type Ctx = {
  db: Planet[]
  user?: { id: number }
}

const impl = createImplementer(contract).$context<Ctx>()

const requireUser = impl.middleware(async ({ context, next }) => {
  if (!context.user) {
    throw new PFError({ code: 'UNAUTHORIZED', status: 401 })
  }
  return next()
})

const authed = impl.use(requireUser)

export const app = impl.router({
  planet: {
    list: impl.planet.list.handler(async ({ context }) => context.db),
    create: authed.planet.create
      .useAfter(async ({ input, next }) => {
        console.log('creating', input.name)
        return next()
      })
      .handler(async ({ input, context }) => {
        const planet = { id: context.db.length + 1, name: input.name }
        context.db.push(planet)
        return planet
      }),
  },
})
