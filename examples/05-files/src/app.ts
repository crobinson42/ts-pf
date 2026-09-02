import { createImplementer } from '@ts-pf/server'
import { contract } from './contract.js'

const planets = [
  { id: 1, name: 'Earth' },
  { id: 2, name: 'Mars' },
]
const photos = new Map<number, File>()

const impl = createImplementer(contract)

export const app = impl.router({
  planet: {
    list: impl.planet.list.handler(async () => planets),
    upload: impl.planet.upload.handler(async ({ input }) => {
      const id = photos.size + 1
      photos.set(id, input.photo)
      return { id, title: input.title, size: input.photo.size }
    }),
    download: impl.planet.download.handler(async ({ input }) => {
      const file = photos.get(input.id)
      if (!file) {
        throw new Error('Photo not found')
      }
      return file
    }),
  },
})
