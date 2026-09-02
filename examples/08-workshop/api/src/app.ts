import { contract } from '@ts-pf/example-workshop-contract'
import { PFError } from '@ts-pf/protocol'
import {
  createImplementer,
  type RequestHeadersPluginContext,
  type ResponseHeadersPluginContext,
} from '@ts-pf/server'
import type { Planet } from './db.js'

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
    find: impl.planet.find.handler(async ({ input, context, errors }) => {
      const row = context.db.find((planet) => planet.id === input.id)
      if (!row) {
        throw errors.NOT_FOUND({ id: input.id })
      }
      return row
    }),
    create: authed.planet.create.handler(async ({ input, context }) => {
      const planet = { id: context.db.length + 1, name: input.name }
      context.db.push(planet)
      return planet
    }),
    describe: impl.planet.describe.handler(async function* ({
      input,
      context,
      errors,
      signal,
    }) {
      const row = context.db.find((planet) => planet.id === input.id)
      if (!row) {
        throw errors.NOT_FOUND({ id: input.id })
      }
      const words = `${row.name} is catalogued in the workshop.`.split(' ')
      for (const token of words) {
        if (signal?.aborted) {
          return
        }
        yield { token }
      }
    }),
  },
})
