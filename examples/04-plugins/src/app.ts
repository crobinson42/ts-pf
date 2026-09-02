import { PFError } from '@ts-pf/protocol'
import {
  createImplementer,
  type RequestHeadersPluginContext,
  type ResponseHeadersPluginContext,
} from '@ts-pf/server'
import { contract } from './contract.js'

export type Planet = { id: number; name: string }

export type Ctx = {
  db: Planet[]
} & RequestHeadersPluginContext &
  ResponseHeadersPluginContext

const impl = createImplementer(contract).$context<Ctx>()

const requireUser = impl.middleware(async ({ context, next }) => {
  if (context.reqHeaders?.get('authorization') !== 'Bearer demo') {
    throw new PFError({ code: 'UNAUTHORIZED', status: 401 })
  }
  return next()
})

const authed = impl.use(requireUser)

export const app = impl.router({
  planet: {
    list: impl.planet.list.handler(async ({ context }) => {
      context.resHeaders?.set('x-planet-count', String(context.db.length))
      return context.db
    }),
    create: authed.planet.create.handler(async ({ input, context }) => {
      const planet = { id: context.db.length + 1, name: input.name }
      context.db.push(planet)
      return planet
    }),
  },
})
