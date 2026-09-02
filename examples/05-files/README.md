# 05 — files

Opt-in `MultipartCodec` for `File` / `Blob`. JSON calls stay JSON.

**Packages:** `@ts-pf/contract`, `@ts-pf/server`, `@ts-pf/client`, `@ts-pf/file`

## Run

```sh
pnpm --filter @ts-pf/example-05-files demo
```

Default port `3105`.

Put the same codec on **both** `FetchHandler` and `FetchLink`. Schemas use `z.file()` / `File` — there is no ts-pf `file()` helper. Limits are codec options (`maxFiles` / `maxFileSize`), not `RequestLimitPlugin`.

## Look at

- `src/server.ts` — `new FetchHandler(app, { codec: new MultipartCodec() })`
- `src/client.ts` — `new FetchLink({ url, codec })`
- `src/contract.ts` — `z.file()` on input and output

Next: [06-streams](../06-streams)
