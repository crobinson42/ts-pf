import {
  CORSPlugin,
  FetchHandler,
  RequestHeadersPlugin,
  ResponseHeadersPlugin,
} from '@ts-pf/server'
import { SseCodec } from '@ts-pf/sse'
import { examplePort, isEntrypoint, listen } from 'ts-pf-example-shared/listen'
import { app } from './app.js'
import { createDb } from './db.js'

const db = createDb()

export const codec = new SseCodec({ keepAliveMs: 15_000 })
export const handler = new FetchHandler(app, {
  codec,
  plugins: [
    new CORSPlugin({ origin: ['http://127.0.0.1:5173'] }),
    new RequestHeadersPlugin(),
    new ResponseHeadersPlugin(),
  ],
})

export const port = examplePort(3108)

export async function start() {
  return listen(handler, {
    port,
    prefix: '/rpc',
    context: { db },
  })
}

if (isEntrypoint(import.meta.url)) {
  const { url } = await start()
  console.log(`listening on ${url}/rpc`)
}
