import { contract } from '@ts-pf/example-swr-contract'
import { createImplementer } from '@ts-pf/server'
import type { Planet } from './db.js'

const impl = createImplementer(contract).$context<{ db: Planet[] }>()

export const app = impl.router({
  planet: {
    list: impl.planet.list.handler(async ({ context }) => context.db),
    find: impl.planet.find.handler(async ({ input, context, errors }) => {
      const row = context.db.find((planet) => planet.id === input.id)
      if (!row) {
        throw errors.NOT_FOUND({ id: input.id })
      }
      return row
    }),
    create: impl.planet.create.handler(async ({ input, context }) => {
      const planet = { id: context.db.length + 1, name: input.name }
      context.db.push(planet)
      return planet
    }),
  },
})
