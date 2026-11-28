# @ts-pf/astro

Opt-in Astro endpoint and in-process page caller for ts-pf. A thin shell around `FetchHandler` and `createClient` — not an integration, middleware, or Astro Actions adapter.

Agent skill: [`skills/ts-pf-astro/`](skills/ts-pf-astro/). Sync with `npx skills experimental_sync -y`.

The package root (`@ts-pf/astro`) exports the client helpers (`createAstroClient`, `withBase`). Server helpers are `@ts-pf/astro/server`. Requires **astro 7** (`>=7.0.0 <8`). The app also imports `@ts-pf/contract`, `@ts-pf/server`, `@ts-pf/server-http`, `@ts-pf/client`, and `@ts-pf/client-http`; declare them on the same major as `@ts-pf/astro` (every `@ts-pf/*` package releases on one version). Pass `import.meta.env.BASE_URL` through `withBase` from app source. This package does not read it.

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

`FetchHandler` runs the context function inside its pipeline, so it runs only for a POST to a known procedure whose body decoded: prefix misses, plugin short-circuits (CORS preflight), 405s, the version / stream-codec / body 400s, and unknown procedures answer without it. A `PFError` it throws (`UNAUTHORIZED` / 401 for a bad token, `FORBIDDEN` / 403 for a non-member) is the response, encoded like a handler error; any other throw is `INTERNAL` and reaches `HandlerPlugin.onError` and the `onError` option (or the default `console.error`). `FetchHandler` owns the request body; inspect raw bytes (a signature check) in a `HandlerPlugin.onRequest`, not in the context function.

## Page

Same context function as the endpoint. Pass `{ signal: Astro.request.signal }` on a call when the page should cancel with the request. Set cookies on the `AstroCookies` object that function put on procedure context (`context.cookies.set`). This package does not copy `Set-Cookie`. Astro writes those cookies onto the response for the route that is rendering: the endpoint `Response` from `createAstroHandler`, and the page response from `createAstroLocalClient`.

```ts
import { createAstroLocalClient } from '@ts-pf/astro/server'

const caller = await createAstroLocalClient(app, Astro, contextFromAstro)
const planet = await caller.planet.find({ id: 1 })
```

In a page the context function has no wire: its throw rejects `createAstroLocalClient` with the thrown value. Catch it in frontmatter (redirect to sign-in, render an error).

## Browser

Import the contract with `import type`. Do not import `@ts-pf/astro/server` or the implementer from a client island or `<script>`. `@ts-pf/swr` works on this client for React islands.

```ts bundler
import { createAstroClient, withBase } from '@ts-pf/astro/client'
import type { contract } from './contract'

export const client = createAstroClient<typeof contract>({
  prefix: withBase(import.meta.env.BASE_URL, '/rpc'),
})
```

## API

- `createAstroHandler`
- `createAstroLocalClient`
- `createAstroClient`
- `withBase`
- `AstroHandlerOptions`
- `AstroLocalClientOptions`

`createAstroHandler`, `createAstroLocalClient`, `AstroHandlerOptions`, and `AstroLocalClientOptions` are `@ts-pf/astro/server`. `createAstroClient` and `withBase` are `@ts-pf/astro` and `@ts-pf/astro/client`.
