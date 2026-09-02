import { PFError } from '@ts-pf/protocol'
import { createImplementer } from '@ts-pf/server'
import { contract } from './contract.js'

const planets = [{ id: 1, name: 'Earth' }]

const impl = createImplementer(contract)

export const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input, errors }) => {
      const row = planets.find((planet) => planet.id === input.id)
      if (!row) {
        throw errors.NOT_FOUND({ id: input.id })
      }
      return row
    }),
    locked: impl.planet.locked.handler(async () => {
      throw new PFError({ code: 'UNAUTHORIZED', status: 401 })
    }),
  },
})
