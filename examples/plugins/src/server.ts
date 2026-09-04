import {
  applyPlugins,
  type CallInterceptor,
  DedupePlugin,
  onFinish,
  onStart,
} from '@ts-pf/server'
import { CORSPlugin, FetchHandler } from '@ts-pf/server-http'
import { type AppContext, app } from './app.js'
import { audit } from './audit-plugin.js'
import { readKey } from './read-key.js'

export const serverLog: string[] = []

const withRequestId: CallInterceptor = ({ context, next }) =>
  next({
    context: {
      ...(context as AppContext),
      requestId: crypto.randomUUID(),
    },
  })

const interceptors = applyPlugins(
  [new DedupePlugin({ key: readKey }), audit],
  [
    withRequestId,
    onStart(({ path, context }) => {
      const requestId = (context as AppContext).requestId
      serverLog.push(`start ${requestId} ${path.join('.')}`)
    }),
    onFinish(({ path }, result) => {
      serverLog.push(`${result.ok ? 'ok' : 'err'} ${path.join('.')}`)
    }),
  ],
)

export const handler = new FetchHandler(app, {
  plugins: [new CORSPlugin({ origin: '*' })],
  interceptors,
})

const context: AppContext = { requestId: 'app' }

export default {
  async fetch(req: Request) {
    const result = await handler.handle(req, {
      prefix: '/rpc',
      context,
    })
    if (!result.matched) {
      return new Response('Not Found', { status: 404 })
    }
    return result.response
  },
}
