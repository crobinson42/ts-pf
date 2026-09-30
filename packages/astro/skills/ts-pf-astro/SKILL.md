---
name: ts-pf-astro
description: Use when serving a ts-pf API from an Astro endpoint or calling it in a page or island. Triggers: @ts-pf/astro, createAstroHandler, createAstroLocalClient, createAstroClient, withBase.
---

# @ts-pf/astro

Opt-in Astro endpoint and in-process page caller. Thin shell around `FetchHandler` and `createClient`. Not an integration, middleware mount, or Astro Actions adapter.

Install: `npm i @ts-pf/astro` (peer **astro >= 4.9.0**). The app already has `@ts-pf/server`, `@ts-pf/server-http`, `@ts-pf/client`, and `@ts-pf/client-http`.

Link for agents: `npx skills experimental_sync -y`

## Do

Endpoint `src/pages/rpc/[...path].ts`. Export `ALL` so CORS `OPTIONS` and non-POST reach `FetchHandler`. Set `prerender = false` when output is static. An adapter is required for on-demand routes. `output: 'server'` already renders on demand. Do not put other pages under `src/pages/rpc/` (static files win over the rest param).

```ts
import { createAstroHandler, withBase } from '@ts-pf/astro/server'

export const prerender = false

export const ALL = createAstroHandler(handler, {
  prefix: withBase(import.meta.env.BASE_URL, '/rpc'),
  context: contextFromAstro,
})
```

Page frontmatter. Same context function as the endpoint when the `Astro` global and `APIContext` are structurally compatible. Pass `{ signal: Astro.request.signal }` on a call when the page should cancel with the request. Set cookies on the `AstroCookies` object the context function put on procedure context (`context.cookies.set`). This package does not copy `Set-Cookie`. Astro writes those cookies onto the response for the route that is rendering: the endpoint `Response` from `createAstroHandler`, and the page response from `createAstroLocalClient`.

```ts
import { createAstroLocalClient } from '@ts-pf/astro/server'

const caller = await createAstroLocalClient(app, Astro, contextFromAstro)
const planet = await caller.planet.find({ id: 1 })
```

Browser or island module. Import the contract with `import type`. Do not import the implementer.

```ts
import { createAstroClient, withBase } from '@ts-pf/astro/client'
import type { contract } from './contract'

export const client = createAstroClient<typeof contract>({
  prefix: withBase(import.meta.env.BASE_URL, '/rpc'),
})
```

`@ts-pf/astro` (root) exports the same client helpers. `@ts-pf/swr` works on that client for React islands.

## API

- `createAstroHandler`
- `createAstroLocalClient`
- `createAstroClient`
- `withBase`
- `AstroHandlerOptions`
- `AstroLocalClientOptions`

`createAstroHandler`, `createAstroLocalClient`, `AstroHandlerOptions`, and `AstroLocalClientOptions` are `@ts-pf/astro/server`. `createAstroClient` and `withBase` are `@ts-pf/astro` and `@ts-pf/astro/client`.

## Pair with

- `ts-pf-server-http`
- `ts-pf-client-http`
- `ts-pf-server`
- `ts-pf-client`

## Don't

- Import `@ts-pf/astro/server` from a client island or `<script>`.
- Import the implementer module from a client module.
- Read `import.meta.env.BASE_URL` inside the library (pass it through `withBase` from app source).
- Mount procedures as Astro Actions.
- Add an Astro integration that injects the route.
- Serve OpenAPI or `catalog.json` from the RPC route.
- Use `trailingSlash: 'always'` or `'never'` when request bodies are streams (`StreamCodec` input). Default `'ignore'` is the match. JSON POST under always/never is a 308 that fetch can follow; a `ReadableStream` body cannot be replayed.
- Consume `request.body` in the context factory before the handler runs.
- Turn off `security.checkOrigin`. It stays on. It covers `multipart/form-data` (file uploads via `MultipartCodec`), not `application/json` or `application/jsonl`.
