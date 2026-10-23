// `npm run bench` (after `npm run build`): ops/s for the call pipeline on one
// small contract. Relative numbers; compare runs on the same machine only.
// See CONTRIBUTING.md "Benchmarks".

import { asResult, createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { procedure, router } from '@ts-pf/contract'
import { PortLink } from '@ts-pf/message-client'
import { PortHandler } from '@ts-pf/message-server'
import { createImplementer, createLocalClient } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { StreamCodec, stream } from '@ts-pf/stream'
import { z } from 'zod'

const contract = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
      }),
    create: procedure
      .input(z.object({ name: z.string() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    tokens: procedure
      .input(z.object({ n: z.number() }))
      .output(stream(z.object({ i: z.number() }))),
  },
})

const impl = createImplementer(contract).$context()
const auth = impl.middleware(async ({ next }) =>
  next({ context: { user: 'u1' } }),
)
const app = impl.use(auth).router({
  planet: {
    find: impl.planet.find.handler(async ({ input, errors }) => {
      if (input.id === 0) throw errors.NOT_FOUND({ id: 0 })
      return { id: input.id, name: 'Earth' }
    }),
    create: impl.planet.create.handler(async ({ input }) => ({
      id: 1,
      name: input.name,
    })),
    tokens: impl.planet.tokens.handler(async function* ({ input }) {
      for (let i = 0; i < input.n; i++) yield { i }
    }),
  },
})
const context = { db: {} }

async function bench(
  name,
  iters,
  fn,
  { warm = Math.min(iters, 2000), runs = 5 } = {},
) {
  for (let i = 0; i < warm; i++) await fn(i)
  const times = []
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now()
    for (let i = 0; i < iters; i++) await fn(i)
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  const med = times[Math.floor(times.length / 2)]
  console.log(
    `${name.padEnd(34)} ${(iters / (med / 1000)).toFixed(0).padStart(8)} ops/s  (median ${med.toFixed(1)} ms / ${iters})`,
  )
}

// 1. in-process client (runProcedure + middleware + validation)
const local = createLocalClient(app, { context })
await bench('local unary', 50_000, (i) => local.planet.find({ id: i + 1 }))
await bench('local declared error (asResult)', 20_000, () =>
  asResult(local.planet.find({ id: 0 })),
)

// 2. HTTP in-process: FetchHandler <-> FetchLink through a fetch stub
const handler = new FetchHandler(app)
const fetchStub = async (url, init) => {
  const res = await handler.handle(new Request(url, init), {
    prefix: '/rpc',
    context,
  })
  return res.matched ? res.response : new Response('nope', { status: 404 })
}
const http = createClient(
  new FetchLink({ url: 'http://x/rpc', fetch: fetchStub }),
)
await bench('http unary (FetchHandler+FetchLink)', 20_000, (i) =>
  http.planet.find({ id: i + 1 }),
)
await bench('http declared error (asResult)', 10_000, () =>
  asResult(http.planet.find({ id: 0 })),
)

// 2b. HTTP stream of 2000 items, JSONL codec
const sc = new StreamCodec()
const sHandler = new FetchHandler(app, { codec: sc })
const sFetch = async (url, init) => {
  const res = await sHandler.handle(new Request(url, init), {
    prefix: '/rpc',
    context,
  })
  return res.response
}
const shttp = createClient(
  new FetchLink({ url: 'http://x/rpc', fetch: sFetch, codec: sc }),
)
await bench(
  'http stream 2000 items (JSONL)',
  50,
  async () => {
    let n = 0
    for await (const _ of await shttp.planet.tokens({ n: 2000 })) n++
    if (n !== 2000) throw new Error('short stream')
  },
  { warm: 5, runs: 5 },
)

// 3. message transport over MessageChannel
const { port1, port2 } = new MessageChannel()
const bind = new PortHandler(app).bind(port1, { context })
const link = new PortLink({ port: port2 })
const msg = createClient(link)
await bench('port unary', 10_000, (i) => msg.planet.find({ id: i + 1 }))
await bench(
  'port stream 2000 items',
  50,
  async () => {
    let n = 0
    for await (const _ of await msg.planet.tokens({ n: 2000 })) n++
    if (n !== 2000) throw new Error('short stream')
  },
  { warm: 5, runs: 5 },
)
link.close()
bind.close()
port1.close()
port2.close()
