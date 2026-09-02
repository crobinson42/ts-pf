import { FetchHandler } from '@ts-pf/server'
import { StreamCodec } from '@ts-pf/stream'
import { examplePort, isEntrypoint, listen } from 'ts-pf-example-shared/listen'
import { app } from './app.js'

export const codec = new StreamCodec()
export const handler = new FetchHandler(app, { codec })
export const port = examplePort(3106)

export async function start() {
  return listen(handler, { port, prefix: '/rpc', context: {} })
}

if (isEntrypoint(import.meta.url)) {
  const { url } = await start()
  console.log(`listening on ${url}/rpc`)
}
