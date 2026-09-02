# 06 — streams

Opt-in `StreamCodec` for root `AsyncIterable` input and output. JSON calls stay JSON. Wire format is JSONL — one RPC envelope per line.

**Packages:** `@ts-pf/contract`, `@ts-pf/server`, `@ts-pf/client`, `@ts-pf/stream`

## Run

```sh
pnpm --filter @ts-pf/example-06-streams demo
```

Default port `3106`.

`stream()` is the contract schema. Handlers may be `async function*`. `FetchLink` sets `duplex: 'half'` when the body is a `ReadableStream` — custom Links must do the same.

Nested streams and `File`/`Blob` inside stream items are not supported.

## Look at

- `src/contract.ts` — `procedure.output(stream(...))` / `procedure.input(stream(...))`
- `src/app.ts` — generator + `for await`, `signal` on the handler
- `src/client.ts` — `for await (const item of await client.planet.chat(...))`

Same contracts, different framing: [07-sse](../07-sse)
