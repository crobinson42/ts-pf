# Examples

Thin apps for the procedure model. Fetch is the default adapter; message, stream, and plugins show other pipes, codecs, and call hooks.

| Example | What |
|---|---|
| [`hello`](hello) | Contract, implementer, `FetchHandler`, `createClient` + `FetchLink` |
| [`message`](message) | `PortHandler` + `PortLink` over `MessageChannel` |
| [`stream`](stream) | `StreamCodec` + `stream()` on the HTTP adapter |
| [`plugins`](plugins) | `CallPlugin` / `CallInterceptor`, retry / cache / dedupe, custom plugins |

Implemented routers are named `app`. Clients do not import `@ts-pf/server`.

Each `@ts-pf/*` package ships a consumer agent skill under `skills/`. After install: `npx skills experimental_sync -y`.
