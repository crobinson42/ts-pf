# @ts-pf/message

## 0.2.2

### Patch Changes

- Updated dependencies [[`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3)]:
  - @ts-pf/protocol@0.2.2

## 0.2.1

### Patch Changes

- [#26](https://github.com/crobinson42/ts-pf/pull/26) [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01) Thanks [@crobinson42](https://github.com/crobinson42)! - Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.
- Updated dependencies [[`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01)]:
  - @ts-pf/protocol@0.2.1

## 0.2.0

### Minor Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`ef951ce`](https://github.com/crobinson42/ts-pf/commit/ef951ce880af2703bbc490131827268ba89a89d5) Thanks [@crobinson42](https://github.com/crobinson42)! - Slow-peer protection on message transports, on by default. No frame changes.

  **`@ts-pf/message`.** `Duplex.send` is now `void | Promise<void>`: a promise means the pipe is above its write high-water mark and the sender must not pull the next item of that stream until it resolves (it must settle on close; a rejection closes the session). `Duplex` gains optional `pause()` / `resume()`. `createStdioDuplex` returns a drain promise when `output.write()` is refused and pauses / resumes the `Readable`; `createWsDuplex(socket, { highWaterMark })` returns one while `socket.bufferedAmount` (new optional member of `WebSocketLike`, with optional `pause` / `resume`) is over the mark, polled every 10 ms, and caps the `CONNECTING` queue the same way; `createPortDuplex` reports nothing (a `MessagePort` has no buffer signal); `createMemoryDuplex({ highWaterMark })` simulates a slow peer for tests and stays synchronous without the option. `MessageSession.send` stays synchronous and returns that promise as `SendResult.drained`; `onFrame` now receives `(frame, size)` where `size` is the frame text length. `createPushQueue({ highWaterMark, onPause, onResume })` bounds the queue (`push(value, size?)`; `onPause` once above the mark, `onResume` once drained to half or on `end` / `fail`; nothing is dropped). New public types: `BackpressureOptions`, `StallInfo`, `PushQueueOptions` (`resolveBackpressure`, `Backpressure`, `DrainWaiter`, `DrainOutcome` are exported `@internal` for the two bindings). Third-party duplexes keep compiling.

  **`@ts-pf/message-server`.** New `HandlerOptions.backpressure?: BackpressureOptions` on every handler, defaults `{ highWaterMark: 1 MiB, drainTimeout: 30_000 }` with an `onStall` that logs one `console.warn` on `aborted` only (a `paused` is delivered to a custom hook but is normal flow control and not logged; a throwing `onStall` is swallowed and never changes the call); `Infinity` disables the bounds, `0` disables the timeout, `false` silences the log; a bad value is a `TypeError` naming the option from the constructor. Before: an output stream's generator ran to completion at full speed no matter how slowly the client read, every frame piled up in the socket or the client's queue (measured +28 MB heap / +150 MB RSS for a 100k-item stream to a stalled consumer), and a late client `break` found nothing left to cancel. Now: the generator is parked at its `yield` while the duplex is over the mark, `onStall({ path, id, action: 'paused', waitedMs: 0 })` fires once per call, and if the client still has not drained after `drainTimeout` that call is aborted — the handler's `signal` fires, the iterator's `return()` runs once, its remaining frames are dropped, `onStall({ action: 'aborted' })` fires, and the client receives a terminal `result` error `INTERNAL` / `Peer did not drain within 30000 ms` if the socket still accepts it. The connection and its other calls continue; `onError` is not invoked (it is not a handler failure). Input streams: a `stream: true` call's `in-item` queue is bounded by the same mark and the handler pauses reading the duplex (connection-wide) until the handler catches up, where the pipe can pause (stdio, npm `ws` 8.x, which exposes `bufferedAmount` / `pause()` / `resume()` and is therefore bounded in both directions; non-`ws` server sockets report but cannot pause). `BackpressureOptions` / `StallInfo` are re-exported as types.

  **`@ts-pf/message-client`.** New `LinkOptions.backpressure?: BackpressureOptions`, same shape and defaults, validated in every link constructor (`WsLink` included). Before: an `AsyncIterable` input was pumped as fast as the iterator yielded. Now: the pump is parked while the duplex is over the mark, and after `drainTimeout` the call fails locally (`isLocalFailure`, `Peer did not drain within 30000 ms`), a `cancel` is sent if the socket accepts it, and the input iterator's `return()` runs once. Output streams you read are bounded by the same mark and pause reads (connection-wide) while your consumer lags, where the pipe can pause; a server that gives up on a slow reader ends the stream with the `INTERNAL` drain error after the items already buffered. On `MessagePort` nothing changes: it cannot report or pause, so the bound there rests on the peer (a credit-window frame is the v2 answer).

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`c81a8f8`](https://github.com/crobinson42/ts-pf/commit/c81a8f85e50aba6d1bfc1fafa4ebe0eb096e9cfd) Thanks [@crobinson42](https://github.com/crobinson42)! - `@ts-pf/message` exports `createPushQueue()` / `PushQueue<T>`: the push-to-`AsyncIterable` queue both message adapters use to turn frames into a stream (`push(value)`, one-shot `end()` or `fail(error)`, one pending `next()` at a time). Custom `Duplex` bindings can use the same primitive. `localFailure` is still re-exported for compatibility but is now `@deprecated` — import it from `@ts-pf/protocol`.

  `@ts-pf/message-server` and `@ts-pf/message-client`: no wire or API change. Both drop their private (and drifted) `push-queue.ts` copies for the shared one. `@ts-pf/message-client` now depends on `@ts-pf/protocol` directly (as `message-server` already did) and uses its `isPFError`, `localFailure`, and `isAsyncIterable` instead of a duck-typed `PFError` check and a local predicate copy. One edge tightens: when a streamed-input iterator throws, a real `PFError` still passes through unchanged, but a plain `Error` that merely carried `code` / `status` fields used to be rejected as-is and is now a `localFailure` with it as `cause`, like any other throw.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`3268bc4`](https://github.com/crobinson42/ts-pf/commit/3268bc4b3cb5b94ceb8e8cb6473b0d7785911b8d) Thanks [@crobinson42](https://github.com/crobinson42)! - `status` on errors is now honest: it is optional transport metadata with no default, set only where a transport really has one.

  **Type change (may stop existing code compiling).** `PFError.status` and `PFErrorInit.status` are `number | undefined` (`@ts-pf/protocol`), and every `ClientError` variant — so `asResult(...).error.status` too — is `status?: number` (`@ts-pf/contract`, surfaced through `@ts-pf/client`). Code that used `status` as a plain number (`err.status.toFixed()`, `err.status >= 500`, passing it to a `number` parameter) needs `?? 400` or a guard. Code that compares `err.status === 404` still compiles but was already only right over HTTP; switch on `err.code` instead.

  **Runtime values per transport, before → after:**

  | Transport                                                                                                                    | before               | after                           |
  | ---------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------- |
  | HTTP unary failure (`FetchLink`)                                                                                             | HTTP response status | unchanged: HTTP response status |
  | HTTP after a stream started (`StreamCodec` JSONL line, `SseCodec` `event: error`, `Stream truncated`, `Invalid error event`) | `200`                | `undefined`                     |
  | WebSocket / stdio / MessagePort (`errorFromEnvelope`)                                                                        | `400`                | `undefined`                     |
  | Local failure (`localFailure`)                                                                                               | `0` + `local: true`  | unchanged                       |
  | In-process (`createLocalClient`, `errors.CODE()` with no declared `status`)                                                  | `400`                | `undefined`                     |
  | In-process, declared `{ status: 404 }`                                                                                       | `404`                | unchanged                       |
  | `new PFError({ code })` with no `status`                                                                                     | `400`                | `undefined`                     |

  **Server-side HTTP responses are unchanged.** `httpStatus()` in `@ts-pf/http` now owns the HTTP default: protocol codes map to `PROTOCOL_HTTP_STATUS`, any other code uses `error.status ?? 400`. A declared error with `status: 404` is still HTTP 404; a declared error with no `status` is still HTTP 400. `httpStatus()` no longer special-cases `local: true` (it returned `0`, which is not a valid `Response.status`; a server never sees a local failure, and one would now map to `INTERNAL` → 500). `createErrorFactory` stamps a declared `ErrorDef.status` and nothing when the definition omits one. `toJSON()` and the wire envelope are unchanged: `{ code, message, data? }`, never `status`.

  **`@ts-pf/mvc-kit`:** mvc-kit classifies a thrown value by `code` only when `status` is a finite number, so `bindClient` now hands mvc-kit a copy of the `PFError` with `status: 400` whenever the transport did not carry one (message links, mid-stream failures, declared errors without `status`). `errorCode` stays the `PFError.code` on every `Link`; the original error is not mutated, and HTTP failures and `localFailure` (`status: 0`) pass through as-is. `bindClient` calls therefore return a chained promise rather than the link's own promise object.

### Patch Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only. READMEs that did not name every symbol in their skill's `## API` section gain a matching `API` list (`check:skills` now asserts it), and every fenced `ts` block in READMEs and skills now type-checks against `dist` (`check:snippets`): missing `procedure` / `z` / `catalog` / `spawn` / `FetchHandler` imports were added, Node-resolved relative imports carry `.js`, the server skill implements the whole example contract, and prose fragments are marked `no-check`.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `engines.node >=22` and ship the MIT `LICENSE` file in the tarball.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5) Thanks [@crobinson42](https://github.com/crobinson42)! - `hello` / `hello-ok` frames and the handshake checks now use `PROTOCOL_MAJOR` from `@ts-pf/protocol` instead of a hard-coded numeric `1`. `HelloFrame.v` / `HelloOkFrame.v` are typed `typeof PROTOCOL_MAJOR` (still the literal `1`). No wire change and no behavior change.

- Updated dependencies [[`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5), [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb), [`5e5a998`](https://github.com/crobinson42/ts-pf/commit/5e5a99848231e36d8bfa1ef57db9169aee6d9750), [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5), [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6), [`53aaa5a`](https://github.com/crobinson42/ts-pf/commit/53aaa5a33ffee876b237ef6a85744c99cd4aa7d1), [`3268bc4`](https://github.com/crobinson42/ts-pf/commit/3268bc4b3cb5b94ceb8e8cb6473b0d7785911b8d)]:
  - @ts-pf/protocol@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [8cf3711]
  - @ts-pf/protocol@0.1.2

## 0.1.1

### Patch Changes

- 92c5262: Point package `exports` at `dist`. npm does not rewrite `publishConfig.exports`, so published tarballs previously resolved to missing `src/` files.
- Updated dependencies [92c5262]
  - @ts-pf/protocol@0.1.1

## 0.1.0

### Patch Changes

- First stable `0.1.0` release. Exit Changesets pre mode and publish to the npm `latest` dist-tag.
- Updated dependencies
  - @ts-pf/protocol@0.1.0

## 0.1.0-beta.2

### Patch Changes

- e85f033: Add npm `keywords` on every published package so the family is discoverable (typescript, rpc, typesafe, contract-first) with per-package terms for the pipe or adapter.
- Updated dependencies [e85f033]
  - @ts-pf/protocol@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Publish from GitHub Actions with npm trusted publishing (OIDC). No `NPM_TOKEN`.
- Updated dependencies
  - @ts-pf/protocol@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 5ffff32: First public beta of the `@ts-pf` packages. Contract-first TypeScript RPC: one procedure model, Fetch and message adapters, and opt-in file, stream, SSE, docs, OpenAPI, codegen, SWR, and mvc-kit packages.

### Patch Changes

- 5ffff32: Ship a consumer agent skill with each package (`skills/ts-pf-<name>/SKILL.md`, plus hub `ts-pf-app` on `@ts-pf/contract`). After install or `npm update`: `npx skills experimental_sync -y`. Skills version with the package. Do not put this on a library `postinstall`.
- Updated dependencies [5ffff32]
- Updated dependencies [5ffff32]
  - @ts-pf/protocol@0.1.0-beta.0
