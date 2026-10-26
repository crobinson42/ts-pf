# Examples

Small, smoke-tested apps for the procedure model. Fetch is the default adapter; `message`, `stream`, and `plugins` show other pipes, codecs, and call hooks; `mcp` serves the same procedure model as MCP tools. Every example runs its client against its handler in-process; `hello` can also listen on a port.

| Example | What |
|---|---|
| [`hello`](hello) | Contract, implementer, `FetchHandler`, `createClient` + `FetchLink`; `npm run dev` serves it on `node:http` |
| [`codegen`](codegen) | Split-repo `emit(catalog)` → `createClient<Contract>` (client cannot import the live contract) |
| [`message`](message) | `PortHandler` + `PortLink` over `MessageChannel` |
| [`stream`](stream) | `StreamCodec` + `stream()` on the HTTP adapter |
| [`plugins`](plugins) | `CallPlugin` / `CallInterceptor`, retry / cache / dedupe, custom plugins, userland GET bridge for cacheable reads |
| [`mcp`](mcp) | `@ts-pf/mcp` toolset + tool host, served by the MCP SDK v2 over HTTP and stdio |

Suggested order: `hello` → `plugins` → `stream` → `message` → `codegen` → `mcp`. Each README has the same three sections: "What it shows", "Run", "What the smoke test asserts".

The in-process pattern every smoke test uses is written up in [`docs/testing.md`](../docs/testing.md) (guide index: [`docs/README.md`](../docs/README.md)).

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
