# ts-pf rules

Contract-first TypeScript RPC library (`@ts-pf/*`). oRPC-like DX is the bar; oRPC's surface area is not. Do not grow the core into a dual-protocol platform.

## Packages

```
@ts-pf/contract     @ts-pf/protocol
        \                /
    @ts-pf/server   @ts-pf/client
```

- `contract` and `protocol` are siblings. Neither depends on the other.
- `server` and `client` each depend on both.
- **Client never depends on server. Server never depends on client.**
- Routers are nested objects, not a fifth package.

| Package | Owns |
|---|---|
| `contract` | `procedure`, `router`, schema adapters, typed errors, infer types |
| `protocol` | `PFError`, JSON envelope, `RpcCodec`, path helpers. No HTTP server. No schemas. |
| `server` | `createImplementer`, middleware, `FetchHandler`, `createLocalClient` |
| `client` | `createClient`, `FetchLink`, interceptors, `asResult` |

## Public names

Do not resurrect oRPC names in code, docs, or examples.

| Use | Not |
|---|---|
| `procedure` / `router` | `oc` |
| `createImplementer` / local `impl` | `implement` / `os` |
| `FetchHandler` | `RPCHandler` |
| `createLocalClient` | `createRouterClient` |
| `asResult` | `safe` |
| `FetchLink` | `RPCLink` |

Implemented routers in examples: `app`, not `router` (that name is the contract helper).

## v1 locks

- Contract-first only. No server-first builder whose output is inferred from the handler.
- One protocol: POST JSON RPC. Path = router keys. Spec: `packages/protocol/PROTOCOL.md`.
- Server runtime: Fetch `Request` / `Response` only.
- `.output()` is optional (`unknown` if omitted). `.input()` once; no stacked merge/pipe.
- `.use()` runs **before** input validation (`input: unknown`). `.useAfter()` runs **after** (typed input).
- Client-side input validation is off by default.

**Not in core:** OpenAPI/REST, Node `IncomingMessage` adapters, framework adapters, TanStack Query, lazy routers, Map/Set on the wire, File/Blob/SSE. Those are later **packages**, not core features.

## Extension (hooks, not a plugin framework)

| Hook | Package |
|---|---|
| `registerSchemaAdapter` | contract |
| `.meta()` / `.$meta()` | contract |
| `.use()` / `.useAfter()` | server |
| `HandlerPlugin` | server (interface only in v1) |
| `RpcCodec` | protocol (`JSONCodec` is the v1 impl) |
| `Link` / interceptors | client |

File/SSE later wraps or replaces the codec without changing contracts. Keep `x-ts-pf-protocol: 1` until the JSON envelope actually breaks.

## Code

- ESM-only, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- One job per file. No HTTP in `contract`. No schemas in `protocol`.
- Tests: Vitest. Type tests: `expectTypeOf` plus `tsc --noEmit`.
- Workspace: pnpm + Turborepo. Build: `tsc -p tsconfig.build.json`.

## Done means verified

```
pnpm lint && pnpm type-check && pnpm test && pnpm build
```

Wire changes must update `packages/protocol/PROTOCOL.md`.
