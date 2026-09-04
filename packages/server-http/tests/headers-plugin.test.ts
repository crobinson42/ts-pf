import { procedure, router } from '@ts-pf/contract'
import { createImplementer, createLocalClient } from '@ts-pf/server'
import {
  FetchHandler,
  RequestHeadersPlugin,
  type RequestHeadersPluginContext,
  ResponseHeadersPlugin,
  type ResponseHeadersPluginContext,
} from '@ts-pf/server-http'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('header plugins', () => {
  it('injects reqHeaders from the request', async () => {
    const c = router({
      ua: procedure.output(z.string().nullable()),
    })
    const i = createImplementer(c).$context<RequestHeadersPluginContext>()
    const built = i.router({
      ua: i.ua.handler(
        async ({ context }) => context.reqHeaders?.get('user-agent') ?? null,
      ),
    })
    const handler = new FetchHandler(built, {
      plugins: [new RequestHeadersPlugin()],
    })
    const result = await handler.handle(
      new Request('http://localhost/rpc/ua', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'pf-test',
        },
        body: '{}',
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(await result.response.json()).toEqual({
      ok: true,
      output: 'pf-test',
    })
  })

  it('merges resHeaders into the HTTP response', async () => {
    const c = router({
      ping: procedure.output(z.string()),
    })
    const i = createImplementer(c).$context<ResponseHeadersPluginContext>()
    const built = i.router({
      ping: i.ping.handler(async ({ context }) => {
        context.resHeaders?.set('x-custom', '1')
        context.resHeaders?.append('set-cookie', 'a=1')
        context.resHeaders?.append('set-cookie', 'b=2')
        return 'ok'
      }),
    })
    const handler = new FetchHandler(built, {
      plugins: [new ResponseHeadersPlugin()],
    })
    const result = await handler.handle(
      new Request('http://localhost/rpc/ping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      { prefix: '/rpc', context: {} },
    )
    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('expected match')
    }
    expect(result.response.headers.get('x-custom')).toBe('1')
    expect(result.response.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
  })

  it('uses a fresh resHeaders per request when context is reused', async () => {
    const c = router({
      ping: procedure.output(z.string()),
    })
    const i = createImplementer(c).$context<ResponseHeadersPluginContext>()
    const built = i.router({
      ping: i.ping.handler(async ({ context }) => {
        context.resHeaders?.set(
          'x-count',
          String(Number(context.resHeaders.get('x-count') ?? '0') + 1),
        )
        return 'ok'
      }),
    })
    const shared = {}
    const handler = new FetchHandler(built, {
      plugins: [new ResponseHeadersPlugin()],
    })
    const once = () =>
      handler.handle(
        new Request('http://localhost/rpc/ping', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }),
        { prefix: '/rpc', context: shared },
      )
    const a = await once()
    const b = await once()
    expect(a.matched && b.matched).toBe(true)
    if (!a.matched || !b.matched) {
      throw new Error('expected match')
    }
    expect(a.response.headers.get('x-count')).toBe('1')
    expect(b.response.headers.get('x-count')).toBe('1')
  })

  it('leaves reqHeaders undefined for createLocalClient', async () => {
    const c = router({
      ua: procedure.output(z.string().nullable()),
    })
    const i = createImplementer(c).$context<RequestHeadersPluginContext>()
    const built = i.router({
      ua: i.ua.handler(
        async ({ context }) => context.reqHeaders?.get('user-agent') ?? null,
      ),
    })
    const client = createLocalClient(built, { context: {} })
    expect(await client.ua()).toBeNull()
  })
})
