import { CORSPlugin, FetchHandler } from '@ts-pf/server'
import { examplePort, isEntrypoint, listen } from 'ts-pf-example-shared/listen'
import { app } from './app.js'
import { createDb } from './db.js'

export const handler = new FetchHandler(app, {
  plugins: [new CORSPlugin({ origin: ['http://127.0.0.1:5174'] })],
})

export const port = examplePort(3112)

export async function start() {
  return listen(handler, {
    port,
    prefix: '/rpc',
    context: { db: createDb() },
  })
}

if (isEntrypoint(import.meta.url)) {
  const { url } = await start()
  console.log(`listening on ${url}/rpc`)
}
