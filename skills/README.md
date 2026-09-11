# Consumer skills

Index only. Published skills live next to the package they describe so they version with that package. Do not put `SKILL.md` files here.

Hub `ts-pf-app` on `@ts-pf/contract` is the capability catalog. `npx skills experimental_sync -y` copies skills from **installed** packages. Uninstalled opt-in packages are discovered from the hub, then `npm i @ts-pf/<pkg> && npx skills experimental_sync -y`.

| Skill | Path | Job |
|---|---|---|
| `ts-pf-app` | `packages/contract/skills/ts-pf-app/` | Catalog: Fetch happy path, compose, opt-in map |
| `ts-pf-contract` | `packages/contract/skills/ts-pf-contract/` | `procedure` / `router`, schemas, typed errors |
| `ts-pf-protocol` | `packages/protocol/skills/ts-pf-protocol/` | `PFError`, envelope, `PROTOCOL.md` |
| `ts-pf-server` | `packages/server/skills/ts-pf-server/` | `createImplementer`, middleware, `runProcedure` |
| `ts-pf-client` | `packages/client/skills/ts-pf-client/` | `createClient`, `asResult`, call plugins |
| `ts-pf-http` | `packages/http/skills/ts-pf-http/` | `JSONCodec`, `RpcCodec`, path helpers |
| `ts-pf-server-http` | `packages/server-http/skills/ts-pf-server-http/` | `FetchHandler`, HTTP `HandlerPlugin`s |
| `ts-pf-client-http` | `packages/client-http/skills/ts-pf-client-http/` | `FetchLink`, Fetch interceptors |
| `ts-pf-file` | `packages/file/skills/ts-pf-file/` | `MultipartCodec` |
| `ts-pf-stream` | `packages/stream/skills/ts-pf-stream/` | `StreamCodec` + `stream()` |
| `ts-pf-sse` | `packages/sse/skills/ts-pf-sse/` | `SseCodec` |
| `ts-pf-docs` | `packages/docs/skills/ts-pf-docs/` | `docs()` / `catalog()` |
| `ts-pf-openapi` | `packages/openapi/skills/ts-pf-openapi/` | `openapi()` OpenAPI 3.1 |
| `ts-pf-codegen` | `packages/codegen/skills/ts-pf-codegen/` | `emit()` / `catalogHash()` |
| `ts-pf-message` | `packages/message/skills/ts-pf-message/` | JSON text frames, duplex adapters |
| `ts-pf-message-server` | `packages/message-server/skills/ts-pf-message-server/` | `PortHandler` / `WsHandler` / `StdioHandler` |
| `ts-pf-message-client` | `packages/message-client/skills/ts-pf-message-client/` | `PortLink` / `WsLink` / `StdioLink` |
| `ts-pf-swr` | `packages/swr/skills/ts-pf-swr/` | `createSwr` |
| `ts-pf-mvc-kit` | `packages/mvc-kit/skills/ts-pf-mvc-kit/` | `bindClient` / `issuesToFieldErrors` |

Library (unpublished) skill: [`.agents/skills/ts-pf/`](../.agents/skills/ts-pf/).
