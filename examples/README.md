# Examples

Runnable apps that teach ts-pf from the README happy path up to a contract-first client/server split and an onion-layered server.

These packages are **not published**. ts-pf does not ship an HTTP adapter — `_shared/listen.ts` is Node glue so demos can bind a port. The library surface is `FetchHandler` + `FetchLink`.

```sh
pnpm install
pnpm --filter @ts-pf/example-01-hello demo
```

Override the listen port with `PORT`. Defaults are `3101`–`3109` so several demos can run at once.

## Learning path

| Example | Teaches | Packages |
|---|---|---|
| [01-hello](01-hello) | Contract, nested router, implementer, `FetchHandler`, `createClient` | contract, server, client |
| [02-errors](02-errors) | Declared `.errors()`, `asResult`, `isLocalFailure` vs `INTERNAL` | contract, server, client, protocol |
| [03-middleware](03-middleware) | `$context`, `.use` / `.useAfter`, `createLocalClient` | contract, server, client, protocol |
| [04-plugins](04-plugins) | CORS / limits / header plugins, interceptors, retry-on-throw, `signal` | contract, server, client, protocol |
| [05-files](05-files) | Opt-in `MultipartCodec` for `File` / `Blob` | + `@ts-pf/file` |
| [06-streams](06-streams) | Opt-in `StreamCodec` + `stream()` (JSONL) | + `@ts-pf/stream` |
| [07-sse](07-sse) | Opt-in `SseCodec` output framing | + `@ts-pf/sse` |
| [08-workshop](08-workshop) | Contract-first monorepo: contract / api / Vite web | contract, server, client, stream, sse, protocol |
| [09-onion-arch](09-onion-arch) | Clean/onion layers: domain, contract as use cases, one `app`, HTTP as an adapter | contract, server, client, protocol |
| [10-docs](10-docs) | Opt-in `@ts-pf/docs` catalog from the contract | + `@ts-pf/docs` |

The domain is **planet** in every example so the README snippets transfer.

Implemented routers are named `app` (not `router` — that name is the contract helper). Client files never import `@ts-pf/server`.
