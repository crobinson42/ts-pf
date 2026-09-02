# 07 — SSE

Opt-in `SseCodec` frames the **same** `stream()` contracts as JSONL, but output is `text/event-stream`. Input streams stay JSONL. Unary JSON stays JSON.

**Packages:** `@ts-pf/contract`, `@ts-pf/server`, `@ts-pf/client`, `@ts-pf/stream`, `@ts-pf/sse`

## Run

```sh
pnpm --filter @ts-pf/example-07-sse demo
```

Default port `3107`.

`stream()` still comes from `@ts-pf/stream` — `@ts-pf/sse` does not re-export it. The client is `FetchLink` + `SseCodec`, not `EventSource`. No `Last-Event-ID`.

This demo uses `{ keepAliveMs: 0 }` so it does not wait on ping timers. Production default is 15s.

## Look at

- `src/server.ts` — `new SseCodec({ keepAliveMs: 0 })` on `FetchHandler`
- `src/contract.ts` — identical shape to [06-streams](../06-streams)

Next: [08-workshop](../08-workshop) splits contract / api / web.
