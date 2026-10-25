// The `{ client }` binding against a real upstream: `createClient` over a
// `FetchLink` whose `fetch` is a `FetchHandler` in-process (a gateway that
// calls an existing ts-pf API as the caller).

import { createClient, type Link } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { procedure, router } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import {
  createImplementer,
  createLocalClient,
  lookupProcedure,
  runProcedure,
} from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  bindTools,
  createToolkit,
  type McpCallInfo,
  type McpTools,
} from '../src/index.js'
import { mcp } from '../src/meta.js'

const Note = z.object({
  id: z.number(),
  owner: z.string(),
  authorId: z.string(),
  text: z.string(),
})

const contract = router({
  note: {
    get: procedure
      .input(z.object({ owner: z.string(), id: z.number().int().min(1) }))
      .output(Note)
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      })
      .meta(mcp({ effect: 'read' })),
    author: procedure
      .input(z.object({ id: z.string() }))
      .output(z.object({ id: z.string(), name: z.string() })),
    slow: procedure.output(z.string()),
    boom: procedure.output(z.string()),
  },
})

// Upstream: its own context, built from the request it receives.
type UpstreamCtx = { caller: string }
const callers: string[] = []
const aborted: string[] = []
const impl = createImplementer(contract).$context<UpstreamCtx>()
const upstream = impl.router({
  note: {
    get: impl.note.get.handler(({ input, context, errors }) => {
      callers.push(context.caller)
      if (input.id !== 1) throw errors.NOT_FOUND({ id: input.id })
      return { id: 1, owner: input.owner, authorId: 'a1', text: 'hello' }
    }),
    author: impl.note.author.handler(({ input }) => ({
      id: input.id,
      name: 'Ada',
    })),
    slow: impl.note.slow.handler(
      ({ signal }) =>
        new Promise<string>((_, reject) => {
          signal?.addEventListener('abort', () => {
            aborted.push('slow')
            reject(new Error('aborted upstream'))
          })
        }),
    ),
    boom: impl.note.boom.handler(() => {
      throw new Error('db password is hunter2')
    }),
  },
})
const handler = new FetchHandler(upstream, { onError: () => {} })
/** In-process `fetch`; like the real one, it rejects as soon as the signal aborts. */
const upstreamFetch: typeof fetch = (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init)
  const response = handler
    .handle(request, {
      prefix: '/rpc',
      context: (req) => ({
        caller: req.headers.get('authorization') ?? 'anonymous',
      }),
    })
    .then((result) =>
      result.matched
        ? result.response
        : new Response('not found', { status: 404 }),
    )
  return new Promise((resolve, reject) => {
    request.signal.addEventListener('abort', () =>
      reject(request.signal.reason),
    )
    response.then(resolve, reject)
  })
}

/** A per-caller client: the caller's token goes upstream as a bearer. */
const clientFor = (info: McpCallInfo) =>
  createClient<typeof contract>(
    new FetchLink({
      url: 'http://upstream/rpc',
      fetch: upstreamFetch,
      headers: { authorization: `Bearer ${info.authInfo?.token ?? '-'}` },
    }),
  )

// MCP side: the toolkit's own context, independent of the upstream's.
type Ctx = { owner: string }
const tk = createToolkit(contract).$context<Ctx>()
const owner = { owner: ({ context }: { context: Ctx }) => context.owner }
const toolset = tk.$toolset({
  tools: {
    note_get: tk.note.get
      .inject(owner)
      .output(
        z.object({ text: z.string(), author: z.string() }),
        async (note, { call }) => ({
          text: note.text,
          author: (await call.note.author({ id: note.authorId })).name,
        }),
      )
      .errors({
        NOT_FOUND: ({ data }) => `No note ${data.id}. Ask for a note id first.`,
      }),
    note_slow: tk.note.slow,
    note_boom: tk.note.boom,
  },
})
const context = (info: McpCallInfo): Ctx => ({
  owner: info.authInfo?.clientId ?? 'nobody',
})
const alice: McpCallInfo = {
  authInfo: { token: 'alice-token', clientId: 'alice', scopes: [] },
}
const text = (r: { content: { text: string }[] }) => r.content[0]?.text ?? ''

afterEach(() => {
  callers.length = 0
  aborted.length = 0
})

describe('bindTools({ client }) over HTTP', () => {
  const onError = vi.fn()
  const tools = bindTools(toolset, { client: clientFor, context, onError })

  afterEach(() => onError.mockReset())

  it('forwards the caller token upstream, injects, and joins with call', async () => {
    const result = await tools.call('note_get', { id: 1 }, alice)
    expect(result.structuredContent).toEqual({ text: 'hello', author: 'Ada' })
    expect(callers).toEqual(['Bearer alice-token'])
  })

  it('maps a declared upstream error with .errors()', async () => {
    const result = await tools.call('note_get', { id: 7 }, alice)
    expect(text(result)).toBe('No note 7. Ask for a note id first.')
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND', data: { id: 7 } }),
      expect.objectContaining({ tool: { name: 'note_get', path: 'note.get' } }),
    )
  })

  it('returns upstream VALIDATION issues with the model-facing schema', async () => {
    const result = await tools.call('note_get', { id: 0 }, alice)
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(/^Invalid input for note_get: id: /)
    expect(text(result)).toContain('Expected schema: {"type":"object"')
    expect(text(result)).not.toContain('owner')
  })

  it('never leaks an unknown upstream error', async () => {
    const result = await tools.call('note_boom', {}, alice)
    expect(text(result)).toBe('INTERNAL: Internal server error')
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL' }),
      expect.anything(),
    )
  })

  it('reports a transport failure as a local failure', async () => {
    const down = bindTools(toolset, {
      client: createClient<typeof contract>(
        new FetchLink({
          url: 'http://upstream/rpc',
          fetch: async () => {
            throw new TypeError('fetch failed')
          },
        }),
      ),
      context,
      onError: () => {},
    })
    const result = await down.call('note_slow', {}, alice)
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(/^INTERNAL: /)
  })

  it('aborts the upstream request when the MCP call is cancelled', async () => {
    const controller = new AbortController()
    const pending = tools.call(
      'note_slow',
      {},
      {
        ...alice,
        signal: controller.signal,
      },
    )
    setTimeout(() => controller.abort(), 10)
    const result = await pending
    expect(text(result)).toBe('INTERNAL: Request aborted')
    await vi.waitFor(() => expect(aborted).toEqual(['slow']))
  })
})

describe('client source detection', () => {
  const call = (tools: McpTools) => tools.call('note_get', { id: 1 }, alice)
  const local = createLocalClient(upstream, { context: { caller: 'local' } })
  const link: Link = {
    call: (path, input) => {
      const procedure = lookupProcedure(upstream, path)
      if (!procedure) throw new Error(path.join('.'))
      return runProcedure(procedure, input, { caller: 'link' })
    },
  }

  it.each([
    ['a createClient proxy over FetchLink', clientFor(alice)],
    [
      'a createClient proxy over a custom Link',
      createClient<typeof contract>(link),
    ],
    ['a createLocalClient object', local],
  ])('uses %s as the client', async (_, client) => {
    const tools = bindTools(toolset, { client, context })
    expect((await call(tools)).isError).toBeUndefined()
  })

  it('builds a per-caller client once per tool call, shared with mapper call', async () => {
    const factory = vi.fn(clientFor)
    const tools = bindTools(toolset, { client: factory, context })
    expect((await call(tools)).isError).toBeUndefined()
    expect(factory).toHaveBeenCalledTimes(1)
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ authInfo: alice.authInfo }),
    )
    await call(tools)
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('rejects a context the toolkit does not provide', async () => {
    const tools = bindTools(toolset, {
      client: clientFor,
      context: () => {
        throw new PFError({ code: 'UNAUTHORIZED', message: 'No caller' })
      },
      onError: () => {},
    })
    expect(text(await tools.call('note_get', { id: 1 }, alice))).toBe(
      'UNAUTHORIZED: No caller',
    )
    expect(callers).toEqual([])
  })
})
