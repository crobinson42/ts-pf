import {
  CORSPlugin,
  FetchHandler,
  RequestHeadersPlugin,
  RequestLimitPlugin,
  ResponseHeadersPlugin,
} from '@ts-pf/server'
import { examplePort, isEntrypoint, listen } from 'ts-pf-example-shared/listen'
import { app, type Planet } from './app.js'

const db: Planet[] = [{ id: 1, name: 'Earth' }]

export const handler = new FetchHandler(app, {
  plugins: [
    new CORSPlugin({ origin: ['http://127.0.0.1:5173'] }),
    new RequestLimitPlugin({ maxBodySize: 1024 }),
    new RequestHeadersPlugin(),
    new ResponseHeadersPlugin(),
  ],
})

export const port = examplePort(3104)

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
