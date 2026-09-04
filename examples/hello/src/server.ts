import { FetchHandler } from '@ts-pf/server-http'
import { app } from './app.js'

export const handler = new FetchHandler(app)

export default {
  async fetch(req: Request) {
    const result = await handler.handle(req, { prefix: '/rpc', context: {} })
    if (!result.matched) {
      return new Response('Not Found', { status: 404 })
    }
    return result.response
  },
}
