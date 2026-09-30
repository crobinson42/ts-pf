# @ts-pf/astro

Opt-in Astro endpoint and in-process page caller for ts-pf. A thin shell around `FetchHandler` and `createClient` — not an integration, middleware, or Astro Actions adapter.

Agent skill: [`skills/ts-pf-astro/`](skills/ts-pf-astro/). Sync with `npx skills experimental_sync -y`.

The package root (`@ts-pf/astro`) exports the client helpers (`createAstroClient`, `withBase`). Server helpers are `@ts-pf/astro/server`. Requires **astro >= 4.9.0**. Pass `import.meta.env.BASE_URL` through `withBase` from app source. This package does not read it.

## Endpoint

`src/pages/rpc/[...path].ts`. `ALL` so CORS `OPTIONS` and non-POST reach `FetchHandler`. `prerender = false` for on-demand routes when output is static. An adapter is required for those routes. `output: 'server'` already renders on demand. Do not put other pages under `src/pages/rpc/` (static files win over the rest param).

```ts
import { createAstroHandler, withBase } from '@ts-pf/astro/server'

export const prerender = false

export const ALL = createAstroHandler(handler, {
  prefix: withBase(import.meta.env.BASE_URL, '/rpc'),
  context: contextFromAstro,
})
```

## Page

Same context function as the endpoint. Pass `{ signal: Astro.request.signal }` on a call when the page should cancel with the request. Set cookies on the `AstroCookies` object that function put on procedure context (`context.cookies.set`). This package does not copy `Set-Cookie`. Astro writes those cookies onto the response for the route that is rendering: the endpoint `Response` from `createAstroHandler`, and the page response from `createAstroLocalClient`.

```ts
import { createAstroLocalClient } from '@ts-pf/astro/server'

const caller = await createAstroLocalClient(app, Astro, contextFromAstro)
const planet = await caller.planet.find({ id: 1 })
```

## Browser

Import the contract with `import type`. Do not import `@ts-pf/astro/server` or the implementer from a client island or `<script>`. `@ts-pf/swr` works on this client for React islands.

```ts
import { createAstroClient, withBase } from '@ts-pf/astro/client'
import type { contract } from './contract'

export const client = createAstroClient<typeof contract>({
  prefix: withBase(import.meta.env.BASE_URL, '/rpc'),
})
```
