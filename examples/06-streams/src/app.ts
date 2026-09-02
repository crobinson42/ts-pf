import { createImplementer } from '@ts-pf/server'
import { contract } from './contract.js'

const impl = createImplementer(contract)

export const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input }) => ({
      id: input.id,
      name: 'Earth',
    })),
    chat: impl.planet.chat.handler(async function* ({ input, signal }) {
      for (const token of input.prompt.split(' ')) {
        if (signal?.aborted) {
          return
        }
        yield { token }
      }
    }),
    ingest: impl.planet.ingest.handler(async ({ input }) => {
      let count = 0
      for await (const item of input) {
        count += item.chunk
      }
      return { count }
    }),
  },
})
