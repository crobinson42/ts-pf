# mcp

`@ts-pf/mcp` over the official MCP SDK v2. A workspace-scoped planet contract becomes MCP tools: one shaped flat tool, one pinned tool, and a split tool host for the rest, served over HTTP and stdio.

## What it shows

- `src/contract.ts`: procedures classified and described in the contract with `mcp({ effect })` from `@ts-pf/mcp/meta` and `docs({ description })`. Every input carries a `workspaceId`.
- `src/app.ts`: the implementer; `planet.remove` checks the `admin` scope in middleware, so enforcement does not depend on MCP annotations.
- `src/mcp.ts`: `createToolkit(contract).$context<AppCtx>()`; `planet_find` hides `workspaceId` with `.inject`, reshapes the result with `.output(schema, map)`, and rewrites `NOT_FOUND` with `.errors`; a `$host` over the remaining planet procedures, split into `query` and `operations`; `$coverage` over the toolset; `bindTools` with a context built from `info.authInfo`; `createMcpFactory`.

## Run

Build the packages once from the repo root (`npm install && npm run build`), then in this folder:

```sh
npm test
```

## What the smoke test asserts

`tests/smoke.test.ts` connects the v2 `Client` four ways: over HTTP (`createMcpHandler(factory).fetch` with the caller's `authInfo`) and over stdio (`serveStdio` on an `InMemoryTransport` pair, identity from the process), each with `versionNegotiation` `auto` and `legacy`. The factory records the `era` the SDK passes, so each mode is proven server-side (`modern` for `auto`, `legacy` for `legacy`). In every mode it checks:

- `tools/list` names the two flat tools plus the four host tools, and `planet_find` hides `workspaceId` and advertises an `outputSchema`.
- `planet_find` returns the reshaped `structuredContent`.
- Invalid arguments return our `Invalid input for planet_find: …` message, and `NOT_FOUND` returns the next-step text.
- Host discovery finds `planet_remove` by query, a caller without `admin` gets `FORBIDDEN`, an admin removes the planet, and an unknown capability lists the valid names.
- An unknown tool is a `-32602` protocol error.

It also asserts that `audit()` reports no errors for the toolset.
