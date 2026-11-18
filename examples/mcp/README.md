# mcp

`@ts-pf/mcp` over the official MCP SDK v2. A workspace-scoped planet contract becomes MCP tools: one shaped flat tool, one pinned tool, and a split tool host for the rest, served over HTTP and stdio.

## What it shows

- `src/contract.ts`: procedures classified and described in the contract with `mcp({ effect })` from `@ts-pf/mcp/meta` and `docs({ description })`. Every input carries a `workspaceId`.
- `src/app.ts`: the implementer; `planet.remove` checks the `admin` scope in middleware, so enforcement does not depend on MCP annotations.
- `src/mcp.ts`: `createToolkit(contract).$context<AppCtx>()`; `planet_find` hides `workspaceId` with `.inject`, reshapes the result with `.output(schema, map)`, and rewrites `NOT_FOUND` with `.errors`; a `$host` over the remaining planet procedures, split into `query` and `operations`; `$coverage` over the toolset; `bindTools` with a context built from `info.authInfo`; `createMcpFactory`.
- `src/host-vector-search.ts`: the same toolset bound with `search: hybridSearch({ embed })`, so host discovery finds `planet_remove` for "destroy world" (no shared words). `embed` is a parameter; the real in-process model is wired below.

## Run

Build the packages once from the repo root (`npm install && npm run build`), then in this folder:

```sh
npm test
```

To try `host-vector-search.ts` with a real model: it can run in this process with transformers.js; no vector database or external service. It is not a dependency of this example because `onnxruntime-node` is about 300 MB:

```sh
npm i @huggingface/transformers
```

```ts no-check
import { pipeline } from '@huggingface/transformers'
import type { Embed } from '@ts-pf/mcp'
import { vectorSearchFactory } from './host-vector-search.js'

const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' })
const embed: Embed = async (texts) =>
  (await extractor([...texts], { pooling: 'mean', normalize: true })).tolist()

export const factory = vectorSearchFactory(embed)
```

The model (about 25 MB) downloads on first use; set `env.cacheDir` or ship the files for offline servers. `onnxruntime-node` is native, so this runs on Node, not on edge runtimes.

## What the smoke test asserts

`tests/smoke.test.ts` connects the v2 `Client` four ways: over HTTP (`createMcpHandler(factory).fetch` with the caller's `authInfo`) and over stdio (`serveStdio` on an `InMemoryTransport` pair, identity from the process), each with `versionNegotiation` `auto` and `legacy`. The factory records the `era` the SDK passes, so each mode is proven server-side (`modern` for `auto`, `legacy` for `legacy`). In every mode it checks:

- `tools/list` names the two flat tools plus the four host tools, and `planet_find` hides `workspaceId` and advertises an `outputSchema`.
- `planet_find` returns the reshaped `structuredContent`.
- Invalid arguments return our `Invalid input for planet_find: …` message, and `NOT_FOUND` returns the next-step text.
- Host discovery finds `planet_remove` by query, a caller without `admin` gets `FORBIDDEN`, an admin removes the planet, and an unknown capability lists the valid names.
- An unknown tool is a `-32602` protocol error.

It also asserts that `audit()` reports no errors for the toolset.

`tests/vector-search.test.ts` passes a small deterministic `embed` (synonyms share an axis), so no model downloads in CI. It checks that BM25 (the default `tools`) finds nothing for "destroy world", that `vectorSearchTools(embed)` returns `planet_remove` then `planet_rename`, that an exact word still ranks first, and that tool vectors are embedded once.
