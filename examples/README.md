# Examples

Thin apps for the procedure model. Fetch is the default adapter; message, stream, and plugins show other pipes, codecs, and call hooks. clean-arch layers a task app (domain, app, infra, api) and serves one contract on Fetch and WebSocket.

| Example | What |
|---|---|
| [`hello`](hello) | Contract, implementer, `FetchHandler`, `createClient` + `FetchLink` |
| [`codegen`](codegen) | Split-repo `emit(catalog)` → `createClient<Contract>` (client cannot import the live contract) |
| [`message`](message) | `PortHandler` + `PortLink` over `MessageChannel` |
| [`stream`](stream) | `StreamCodec` + `stream()` on the HTTP adapter |
| [`plugins`](plugins) | `CallPlugin` / `CallInterceptor`, retry / cache / dedupe, custom plugins |
| [`clean-arch`](clean-arch) | Onion layers; one file per use case; `FetchHandler` and `WsHandler` |

Implemented routers are named `app`. Clients do not import `@ts-pf/server`.

Each `@ts-pf/*` package ships a consumer agent skill under `skills/`. After install: `npx skills experimental_sync -y`.
