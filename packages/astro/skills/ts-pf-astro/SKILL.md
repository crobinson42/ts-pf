---
name: ts-pf-astro
description: "Use when serving a ts-pf API from an Astro endpoint or calling it in a page or island. Triggers: @ts-pf/astro, createAstroHandler, createAstroLocalClient, createAstroClient, withBase."
---

# @ts-pf/astro

Opt-in Astro endpoint and in-process page caller. Thin shell around `FetchHandler` and `createClient`. Not an integration, middleware mount, or Astro Actions adapter.

Install: `npm i @ts-pf/astro@^<major>` (`<major>` = the major of your other `@ts-pf/*` packages; peer **astro 7** (`>=7.0.0 <8`)). The app also imports `@ts-pf/contract`, `@ts-pf/server`, `@ts-pf/server-http`, `@ts-pf/client`, and `@ts-pf/client-http` directly, so it declares them too, on the same major as `@ts-pf/astro` (every `@ts-pf/*` package releases on one version; `^` ranges keep one copy within a major).

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

`FetchHandler` runs the context function inside its pipeline, so it runs only for a POST to a known procedure whose body decoded: prefix misses, plugin short-circuits (CORS preflight), 405s, the version / stream-codec / body 400s, and unknown procedures answer without it. A `PFError` it throws (`UNAUTHORIZED` / 401 for a bad token, `FORBIDDEN` / 403 for a non-member) is the response, encoded like a handler error; any other throw is `INTERNAL` and reaches `HandlerPlugin.onError` and the `onError` option (or the default `console.error`). `FetchHandler` owns the request body; inspect raw bytes (a signature check) in a `HandlerPlugin.onRequest`, not in the context function.

Page frontmatter. Same context function as the endpoint when the `Astro` global and `APIContext` are structurally compatible. Pass `{ signal: Astro.request.signal }` on a call when the page should cancel with the request. Set cookies on the `AstroCookies` object the context function put on procedure context (`context.cookies.set`). This package does not copy `Set-Cookie`. Astro writes those cookies onto the response for the route that is rendering: the endpoint `Response` from `createAstroHandler`, and the page response from `createAstroLocalClient`.

```ts
import { createAstroLocalClient } from '@ts-pf/astro/server'

const caller = await createAstroLocalClient(app, Astro, contextFromAstro)
const planet = await caller.planet.find({ id: 1 })
```

In a page the context function has no wire: its throw rejects `createAstroLocalClient` with the thrown value. Catch it in frontmatter (redirect to sign-in, render an error).

Browser or island module. Import the contract with `import type`. Do not import the implementer.

```ts bundler
import { createAstroClient, withBase } from '@ts-pf/astro/client'
import type { contract } from './contract'

export const client = createAstroClient<typeof contract>({
  prefix: withBase(import.meta.env.BASE_URL, '/rpc'),
})
```

`@ts-pf/astro` (root) exports the same client helpers. `@ts-pf/swr` works on that client for React islands.

Ban server-side and Node-only entry points in island code with a lint rule scoped to island and browser-script modules, not `.astro` files (their frontmatter runs on the server and may import them). Keep `<script>` logic in `src/scripts/**` modules so the rule covers it. Biome (adjust `includes` to your layout):

```json
{
  "overrides": [
    {
      "includes": ["src/components/**/*.tsx", "src/scripts/**/*.ts"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "paths": {
                  "@ts-pf/astro/server": "Server-side",
                  "@ts-pf/server": "Server-side",
                  "@ts-pf/server-http": "Server-side",
                  "@ts-pf/message-server": "Server-side",
                  "@ts-pf/message-server/stdio": "Server-side (Node)",
                  "@ts-pf/mcp": "Server-side",
                  "@ts-pf/mcp/sdk": "Server-side",
                  "@ts-pf/message/stdio": "Node-only",
                  "@ts-pf/message-client/stdio": "Node-only",
                  "@ts-pf/codegen": "Node-only (build time)"
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

ESLint: `no-restricted-imports` with the same names under `paths` (exact names; `@ts-pf/astro` and `@ts-pf/astro/client` stay allowed).

`createAstroHandler(handler, { context })` checks `context` against the context type `FetchHandler` inferred from `app`; `createAstroLocalClient(app, Astro, context)` checks it against `app`'s `$context<C>()`. `createAstroClient` needs the contract type: `createAstroClient<typeof contract>({ prefix })`, or a `ContractClient<typeof contract>` annotation on the variable or return type. Without either the result is `{ readonly '~error': 'Pass createAstroClient<typeof contract>({ prefix })' }`, not an empty client.

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
- Read `request.body` (or `request.clone()`) in the context function. `FetchHandler` owns the body: JSON and multipart bodies are already consumed, and a JSONL stream body is read later by the handler.
- Turn off `security.checkOrigin`. It stays on. It covers `multipart/form-data` (file uploads via `MultipartCodec`), not `application/json` or `application/jsonl`.
