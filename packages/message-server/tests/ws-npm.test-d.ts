// Checked by `tsc --noEmit` (type-check); not run by Vitest.
// `@types/ws` is a devDependency used only here, as a type fixture: an npm
// `ws` 8 server socket must bind without a cast. No runtime `ws` import.
import type { IncomingMessage } from 'node:http'
import { procedure, router } from '@ts-pf/contract'
import type { WebSocketLike } from '@ts-pf/message'
import { createImplementer } from '@ts-pf/server'
import { describe, expectTypeOf, it } from 'vitest'
import type { WebSocket } from 'ws'
import { z } from 'zod'
import { WsHandler } from '../src/index.js'

const contract = router({
  ping: procedure.input(z.object({})).output(z.literal('pong')),
})

type AppCtx = { user: string }

const impl = createImplementer(contract).$context<AppCtx>()
const app = impl.router({
  ping: impl.ping.handler(async () => 'pong' as const),
})

declare const socket: WebSocket
declare const request: IncomingMessage

describe('npm ws server socket', () => {
  it('is a WebSocketLike', () => {
    expectTypeOf(socket).toExtend<WebSocketLike>()
  })

  it('binds to WsHandler with no cast', () => {
    const handler = new WsHandler(app)
    handler.bind(socket, { context: { user: String(request.url) } })
    handler.bind(socket, {
      context: (info) => {
        expectTypeOf(info.socket).toEqualTypeOf<WebSocketLike>()
        return { user: 'ada' }
      },
    })
  })
})
