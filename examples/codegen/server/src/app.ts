import { createImplementer } from '@ts-pf/server'
import { contract } from './contract.js'

type Planet = { id: number; name: string }

const planets: Planet[] = [
  { id: 1, name: 'Earth' },
  { id: 2, name: 'Mars' },
]

const impl = createImplementer(contract)

export const app = impl.router({
  planet: {
    list: impl.planet.list.handler(async () => planets),
    find: impl.planet.find.handler(async ({ input, errors }) => {
      const row = planets.find((planet) => planet.id === input.id)
      if (!row) {
        throw errors.NOT_FOUND({ id: input.id })
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
