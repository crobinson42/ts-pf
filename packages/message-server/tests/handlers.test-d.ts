// Checked by `tsc --noEmit` (type-check); not run by Vitest.
import type { Readable, Writable } from 'node:stream'
import { procedure, router } from '@ts-pf/contract'
import type { WebSocketLike } from '@ts-pf/message'
import { createImplementer, type ImplementedRouter } from '@ts-pf/server'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { PortHandler, WsHandler } from '../src/index.js'
import { StdioHandler } from '../src/stdio.js'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
})

type AppCtx = { db: string; user?: string }

const impl = createImplementer(contract).$context<AppCtx>()
const app = impl.router({
  planet: {
    find: impl.planet.find.handler(async ({ input }) => ({
      id: input.id,
      name: 'earth',
    })),
  },
})

declare const port: MessagePort
declare const socket: WebSocketLike
declare const input: Readable
declare const output: Writable

describe('PortHandler context inference', () => {
  it('infers TCtx from the router', () => {
    const handler = new PortHandler(app)
    expectTypeOf(handler).toEqualTypeOf<PortHandler<AppCtx>>()
    handler.bind(port, { context: { db: 'x' } })
    handler.bind(port, {
      context: (info) => {
        expectTypeOf(info.port).toEqualTypeOf<MessagePort>()
        expectTypeOf(info.meta).toEqualTypeOf<unknown>()
        return { db: 'x' }
      },
    })
    handler.bind(port, { context: async () => ({ db: 'x', user: 'ada' }) })
  })

  it('rejects a context that does not match $context<C>()', () => {
    const handler = new PortHandler(app)
    // @ts-expect-error context must be AppCtx
    handler.bind(port, { context: { wrong: 1 } })
    // @ts-expect-error the factory must return AppCtx
    handler.bind(port, { context: () => ({ wrong: 1 }) })
  })

  it('still accepts an explicit generic that satisfies the router', () => {
    new PortHandler<AppCtx>(app)
    // @ts-expect-error { user } does not provide db
    new PortHandler<{ user: string }>(app)
  })

  it('falls back to unknown for an unbranded router', () => {
    const annotated: ImplementedRouter = app
    const handler = new PortHandler(annotated)
    expectTypeOf(handler).toEqualTypeOf<PortHandler<unknown>>()
    handler.bind(port, { context: { anything: true } })
  })
})

describe('WsHandler context inference', () => {
  it('infers TCtx from the router', () => {
    const handler = new WsHandler(app)
    expectTypeOf(handler).toEqualTypeOf<WsHandler<AppCtx>>()
    handler.bind(socket, { context: (info) => ({ db: String(info.meta) }) })
    // @ts-expect-error context must be AppCtx
    handler.bind(socket, { context: { wrong: 1 } })
  })
})

describe('StdioHandler context inference', () => {
  it('infers TCtx from the router', () => {
    const handler = new StdioHandler(app)
    expectTypeOf(handler).toEqualTypeOf<StdioHandler<AppCtx>>()
    handler.bind({ input, output }, { context: { db: 'x' } })
    // @ts-expect-error context must be AppCtx
    handler.bind({ input, output }, { context: { wrong: 1 } })
  })
})
