import { FetchHandler } from '@ts-pf/server'
import { examplePort, isEntrypoint, listen } from 'ts-pf-example-shared/listen'
import { app, type Ctx } from './app.js'
import { createDb } from './db.js'

const db = createDb()

export const handler = new FetchHandler(app)
export const port = examplePort(3103)

function contextFromRequest(req: Request): Ctx {
  return {
    db,
    ...(req.headers.get('authorization') === 'Bearer demo'
      ? { user: { id: 1 } }
      : {}),
  }
}

export async function start() {
  return listen(handler, {
    port,
    prefix: '/rpc',
    context: contextFromRequest,
  })
}

if (isEntrypoint(import.meta.url)) {
  const { url } = await start()
  console.log(`listening on ${url}/rpc`)
}
