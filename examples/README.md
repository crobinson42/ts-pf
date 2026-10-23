# Examples

Small, smoke-tested apps for the procedure model. Fetch is the default adapter; `message`, `stream`, and `plugins` show other pipes, codecs, and call hooks. Every example runs its client against its handler in-process; `hello` can also listen on a port.

| Example | What |
|---|---|
| [`hello`](hello) | Contract, implementer, `FetchHandler`, `createClient` + `FetchLink`; `npm run dev` serves it on `node:http` |
| [`codegen`](codegen) | Split-repo `emit(catalog)` → `createClient<Contract>` (client cannot import the live contract) |
| [`message`](message) | `PortHandler` + `PortLink` over `MessageChannel` |
| [`stream`](stream) | `StreamCodec` + `stream()` on the HTTP adapter |
| [`plugins`](plugins) | `CallPlugin` / `CallInterceptor`, retry / cache / dedupe, custom plugins |

Suggested order: `hello` → `plugins` → `stream` → `message` → `codegen`. Each README has the same three sections: "What it shows", "Run", "What the smoke test asserts".

## Run

Examples import `@ts-pf/*` from each package's `dist`, so build once from the repo root:

```sh
npm install && npm run build
npm test                          # every package and example via Turborepo (builds first)
npm run test:root                 # same tests through the root vitest.config.ts (no build step)
cd examples/hello && npm test     # one example
cd examples/hello && npm run dev  # hello only: POST http://127.0.0.1:8787/rpc/planet/find
```

Implemented routers are named `app`. Clients do not import `@ts-pf/server`. `hello/src/serve.ts` is an example-local `node:http` bridge, not a published adapter.

Each `@ts-pf/*` package ships a consumer agent skill under `skills/`. After install: `npx skills experimental_sync -y`.
