import type { AppDeps } from '@ts-pf/example-clean-arch-app'
import { FetchHandler } from '@ts-pf/server-http'
import { StreamCodec } from '@ts-pf/stream'
import { app } from './app.js'
import { callerFromRequest } from './caller-from-request.js'

export function createFetch(deps: AppDeps) {
  const handler = new FetchHandler(app, { codec: new StreamCodec() })
  return async function fetch(req: Request): Promise<Response> {
    const result = await handler.handle(req, {
      prefix: '/rpc',
      context: { deps, caller: callerFromRequest(req) },
    })
    if (!result.matched) {
      return new Response('Not Found', { status: 404 })
    }
    return result.response
  }
}
