# 11 — message

Opt-in MessagePort transport. Same planet contract and `app` as [01-hello](../01-hello), but over an in-process `MessageChannel` instead of Fetch.

This is **not** the README happy path. Default handler/link stay `FetchHandler` + `FetchLink`.

**Packages:** `@ts-pf/contract`, `@ts-pf/server`, `@ts-pf/client`, `@ts-pf/message-server`, `@ts-pf/message-client`

## Run

```sh
pnpm --filter @ts-pf/example-11-message demo
```

No HTTP server, no bundler, no Worker URL. `demo.ts` creates a `MessageChannel`, binds `port1`, and calls over `port2`.

Expected:

```
list [ { id: 1, name: 'Earth' }, { id: 2, name: 'Mars' } ]
find { id: 1, name: 'Earth' }
create { id: 3, name: 'Venus' }
```

## Look at

- `src/contract.ts` / `src/app.ts` — same planet `list` / `find` / `create` as 01-hello
- `src/server.ts` — `new PortHandler(app).bind(port, { context })`
- `src/client.ts` — `createClient(new PortLink({ port }))`. This file does not import `@ts-pf/server`
- `src/demo.ts` — wires the channel, binds, calls, `close()`

WebSocket (`WsHandler` / `WsLink`) and stdio (`StdioHandler` / `StdioLink` on `./stdio`) are the other two bindings. Wire spec: [`packages/protocol/PROTOCOL.md`](../../packages/protocol/PROTOCOL.md) (Message transports).
