import { FetchHandler } from '@ts-pf/server'
import { examplePort, isEntrypoint, listen } from 'ts-pf-example-shared/listen'
import { app } from './app.js'

export const handler = new FetchHandler(app)
export const port = examplePort(3101)

export async function start() {
  return listen(handler, { port, prefix: '/rpc', context: {} })
}

if (isEntrypoint(import.meta.url)) {
  const { url } = await start()
  console.log(`listening on ${url}/rpc`)
}
