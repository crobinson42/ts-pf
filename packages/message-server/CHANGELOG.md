# @ts-pf/message-server

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @ts-pf/server@0.4.1

## 0.3.0

### Minor Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`ef951ce`](https://github.com/crobinson42/ts-pf/commit/ef951ce880af2703bbc490131827268ba89a89d5) Thanks [@crobinson42](https://github.com/crobinson42)! - Slow-peer protection on message transports, on by default. No frame changes.

  **`@ts-pf/message`.** `Duplex.send` is now `void | Promise<void>`: a promise means the pipe is above its write high-water mark and the sender must not pull the next item of that stream until it resolves (it must settle on close; a rejection closes the session). `Duplex` gains optional `pause()` / `resume()`. `createStdioDuplex` returns a drain promise when `output.write()` is refused and pauses / resumes the `Readable`; `createWsDuplex(socket, { highWaterMark })` returns one while `socket.bufferedAmount` (new optional member of `WebSocketLike`, with optional `pause` / `resume`) is over the mark, polled every 10 ms, and caps the `CONNECTING` queue the same way; `createPortDuplex` reports nothing (a `MessagePort` has no buffer signal); `createMemoryDuplex({ highWaterMark })` simulates a slow peer for tests and stays synchronous without the option. `MessageSession.send` stays synchronous and returns that promise as `SendResult.drained`; `onFrame` now receives `(frame, size)` where `size` is the frame text length. `createPushQueue({ highWaterMark, onPause, onResume })` bounds the queue (`push(value, size?)`; `onPause` once above the mark, `onResume` once drained to half or on `end` / `fail`; nothing is dropped). New public types: `BackpressureOptions`, `StallInfo`, `PushQueueOptions` (`resolveBackpressure`, `Backpressure`, `DrainWaiter`, `DrainOutcome` are exported `@internal` for the two bindings). Third-party duplexes keep compiling.

  **`@ts-pf/message-server`.** New `HandlerOptions.backpressure?: BackpressureOptions` on every handler, defaults `{ highWaterMark: 1 MiB, drainTimeout: 30_000 }` with an `onStall` that logs one `console.warn` on `aborted` only (a `paused` is delivered to a custom hook but is normal flow control and not logged; a throwing `onStall` is swallowed and never changes the call); `Infinity` disables the bounds, `0` disables the timeout, `false` silences the log; a bad value is a `TypeError` naming the option from the constructor. Before: an output stream's generator ran to completion at full speed no matter how slowly the client read, every frame piled up in the socket or the client's queue (measured +28 MB heap / +150 MB RSS for a 100k-item stream to a stalled consumer), and a late client `break` found nothing left to cancel. Now: the generator is parked at its `yield` while the duplex is over the mark, `onStall({ path, id, action: 'paused', waitedMs: 0 })` fires once per call, and if the client still has not drained after `drainTimeout` that call is aborted — the handler's `signal` fires, the iterator's `return()` runs once, its remaining frames are dropped, `onStall({ action: 'aborted' })` fires, and the client receives a terminal `result` error `INTERNAL` / `Peer did not drain within 30000 ms` if the socket still accepts it. The connection and its other calls continue; `onError` is not invoked (it is not a handler failure). Input streams: a `stream: true` call's `in-item` queue is bounded by the same mark and the handler pauses reading the duplex (connection-wide) until the handler catches up, where the pipe can pause (stdio, npm `ws` 8.x, which exposes `bufferedAmount` / `pause()` / `resume()` and is therefore bounded in both directions; non-`ws` server sockets report but cannot pause). `BackpressureOptions` / `StallInfo` are re-exported as types.

  **`@ts-pf/message-client`.** New `LinkOptions.backpressure?: BackpressureOptions`, same shape and defaults, validated in every link constructor (`WsLink` included). Before: an `AsyncIterable` input was pumped as fast as the iterator yielded. Now: the pump is parked while the duplex is over the mark, and after `drainTimeout` the call fails locally (`isLocalFailure`, `Peer did not drain within 30000 ms`), a `cancel` is sent if the socket accepts it, and the input iterator's `return()` runs once. Output streams you read are bounded by the same mark and pause reads (connection-wide) while your consumer lags, where the pipe can pause; a server that gives up on a slow reader ends the stream with the `INTERNAL` drain error after the items already buffered. On `MessagePort` nothing changes: it cannot report or pause, so the bound there rests on the peer (a credit-window frame is the v2 answer).

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`019db0d`](https://github.com/crobinson42/ts-pf/commit/019db0d57c1f75d065fd09272c1ed70319397720) Thanks [@crobinson42](https://github.com/crobinson42)! - New `DuplexHandler<TCtx>`: `new DuplexHandler(app, options).bind(duplex, { context })` serves an implemented `app` over any `Duplex` from `@ts-pf/message`, so a third-party pipe (Electron IPC, a Chrome runtime port, WebTransport, a Unix socket) is a ~60-line duplex adapter instead of a rewrite of the multiplexer. It takes the same `HandlerOptions` as `PortHandler` (`maxFrameBytes`, `helloTimeoutMs`, `onError`, `interceptors`, `validation`), infers `TCtx` from the app's context brand the same way, and returns the same `{ close() }` handle. `PortHandler`, `WsHandler`, and `StdioHandler` are now thin wrappers over it; their public shapes and wire behaviour are unchanged.

  Internal: the per-connection multiplexer is split into a frame router (`attachRouter`) and a per-id `ServerCall` state object. No frame or ordering changed.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`3c61912`](https://github.com/crobinson42/ts-pf/commit/3c6191249ca1c7480af807f5559cfbb4bb9979b6) Thanks [@crobinson42](https://github.com/crobinson42)! - `new PortHandler(app)`, `new WsHandler(app)`, and `new StdioHandler(app)` infer `TCtx` from the app's context brand (the `$context<C>()` type behind `impl.router()`), so `bind(..., { context })` is checked against it, for a value or a `(info) => ctx` factory. An explicit `new PortHandler<AppCtx>(app)` is still accepted when `AppCtx` satisfies the app's context. A tree not produced by `impl.router()` infers `TCtx = unknown` (only the router-level brand is read); an implementer that never called `$context()` brands `object`, so a non-object `context` is rejected.

  Previously compiling code that can stop compiling, intended: `bind(..., { context })` with a value or factory result that does not satisfy `$context<C>()`, and an explicit generic narrower than the app's context.

### Patch Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only. READMEs that did not name every symbol in their skill's `## API` section gain a matching `API` list (`check:skills` now asserts it), and every fenced `ts` block in READMEs and skills now type-checks against `dist` (`check:snippets`): missing `procedure` / `z` / `catalog` / `spawn` / `FetchHandler` imports were added, Node-resolved relative imports carry `.js`, the server skill implements the whole example contract, and prose fragments are marked `no-check`.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `engines.node >=22` and ship the MIT `LICENSE` file in the tarball.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`c81a8f8`](https://github.com/crobinson42/ts-pf/commit/c81a8f85e50aba6d1bfc1fafa4ebe0eb096e9cfd) Thanks [@crobinson42](https://github.com/crobinson42)! - `@ts-pf/message` exports `createPushQueue()` / `PushQueue<T>`: the push-to-`AsyncIterable` queue both message adapters use to turn frames into a stream (`push(value)`, one-shot `end()` or `fail(error)`, one pending `next()` at a time). Custom `Duplex` bindings can use the same primitive. `localFailure` is still re-exported for compatibility but is now `@deprecated` — import it from `@ts-pf/protocol`.

  `@ts-pf/message-server` and `@ts-pf/message-client`: no wire or API change. Both drop their private (and drifted) `push-queue.ts` copies for the shared one. `@ts-pf/message-client` now depends on `@ts-pf/protocol` directly (as `message-server` already did) and uses its `isPFError`, `localFailure`, and `isAsyncIterable` instead of a duck-typed `PFError` check and a local predicate copy. One edge tightens: when a streamed-input iterator throws, a real `PFError` still passes through unchanged, but a plain `Error` that merely carried `code` / `status` fields used to be rejected as-is and is now a `localFailure` with it as `cause`, like any other throw.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6) Thanks [@crobinson42](https://github.com/crobinson42)! - Internal refactor, no behaviour change: the "unknown throw becomes `INTERNAL`" mapping and the "is this a stream" predicate now come from `@ts-pf/protocol` (`toWireError`, `isAsyncIterable`) instead of a private copy in each package.

  - `@ts-pf/server-http` (`FetchHandler` error response), `@ts-pf/message-server` (`result` frames), `@ts-pf/stream` and `@ts-pf/sse` (in-band failure lines) encode failures with `toWireError`. The bytes on the wire are identical: `PFError` → `{ code, message, data? }`, anything else → `{ code: 'INTERNAL', message: 'Internal server error' }`. `onError` hooks and the default log still receive the original thrown value; HTTP status still comes from `httpStatus()`.
  - `@ts-pf/client` (`RetryPlugin`, `DedupePlugin`, `CachePlugin`) and `@ts-pf/server` (`DedupePlugin`, the `runProcedure` output wrap) use protocol `isAsyncIterable`. `@ts-pf/stream`, `@ts-pf/sse`, and `@ts-pf/message-server` compose it with the same `ReadableStream` exclusion they had before (a local `isItemStream`), so a `ReadableStream` is still a plain value, not a stream of items. `@ts-pf/swr` does not depend on `@ts-pf/protocol` and keeps a local copy (comment only). `@ts-pf/message-client` now depends on `@ts-pf/protocol` and composes the same `isItemStream` (see its own entry).

- Updated dependencies [[`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5), [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb), [`ef951ce`](https://github.com/crobinson42/ts-pf/commit/ef951ce880af2703bbc490131827268ba89a89d5), [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5), [`c81a8f8`](https://github.com/crobinson42/ts-pf/commit/c81a8f85e50aba6d1bfc1fafa4ebe0eb096e9cfd), [`5e5a998`](https://github.com/crobinson42/ts-pf/commit/5e5a99848231e36d8bfa1ef57db9169aee6d9750), [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5), [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6), [`53aaa5a`](https://github.com/crobinson42/ts-pf/commit/53aaa5a33ffee876b237ef6a85744c99cd4aa7d1), [`e7ccbb5`](https://github.com/crobinson42/ts-pf/commit/e7ccbb55b4431a10e8bd301cafc9eb21ff54984c), [`1505305`](https://github.com/crobinson42/ts-pf/commit/1505305f3d5df3547f5746243aa710f6a6d835c7), [`d3498b5`](https://github.com/crobinson42/ts-pf/commit/d3498b57ed2d48b159b80f3c952e33a5824af77c), [`3268bc4`](https://github.com/crobinson42/ts-pf/commit/3268bc4b3cb5b94ceb8e8cb6473b0d7785911b8d), [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6)]:
  - @ts-pf/message@0.2.0
  - @ts-pf/protocol@0.2.0
  - @ts-pf/server@0.4.0

## 0.2.1

### Patch Changes

- @ts-pf/server@0.3.1

## 0.2.0

### Minor Changes

- 8cf3711: Output schema checks, including stream output items, run only when `validation.output` is true. Input checks stay on unless `validation.input` is false. Parsed output (strip, defaults, transforms) is applied only when output checks are on.

### Patch Changes

- Updated dependencies [8cf3711]
  - @ts-pf/server@0.3.0
  - @ts-pf/protocol@0.1.2
  - @ts-pf/message@0.1.2

## 0.1.3

### Patch Changes

- @ts-pf/server@0.2.2

## 0.1.2

### Patch Changes

- 92c5262: Point package `exports` at `dist`. npm does not rewrite `publishConfig.exports`, so published tarballs previously resolved to missing `src/` files.
- Updated dependencies [92c5262]
  - @ts-pf/message@0.1.1
  - @ts-pf/protocol@0.1.1
  - @ts-pf/server@0.2.1

## 0.1.1

### Patch Changes

- Updated dependencies [1070bfa]
  - @ts-pf/server@0.2.0

## 0.1.0

### Patch Changes

- First stable `0.1.0` release. Exit Changesets pre mode and publish to the npm `latest` dist-tag.
- Updated dependencies
  - @ts-pf/message@0.1.0
  - @ts-pf/protocol@0.1.0
  - @ts-pf/server@0.1.0

## 0.1.0-beta.2

### Patch Changes

- e85f033: Add npm `keywords` on every published package so the family is discoverable (typescript, rpc, typesafe, contract-first) with per-package terms for the pipe or adapter.
- Updated dependencies [e85f033]
  - @ts-pf/message@0.1.0-beta.2
  - @ts-pf/protocol@0.1.0-beta.2
  - @ts-pf/server@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Publish from GitHub Actions with npm trusted publishing (OIDC). No `NPM_TOKEN`.
- Updated dependencies
  - @ts-pf/message@0.1.0-beta.1
  - @ts-pf/protocol@0.1.0-beta.1
  - @ts-pf/server@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 5ffff32: First public beta of the `@ts-pf` packages. Contract-first TypeScript RPC: one procedure model, Fetch and message adapters, and opt-in file, stream, SSE, docs, OpenAPI, codegen, SWR, and mvc-kit packages.

### Patch Changes

- 5ffff32: Ship a consumer agent skill with each package (`skills/ts-pf-<name>/SKILL.md`, plus hub `ts-pf-app` on `@ts-pf/contract`). After install or `npm update`: `npx skills experimental_sync -y`. Skills version with the package. Do not put this on a library `postinstall`.
- Updated dependencies [5ffff32]
- Updated dependencies [5ffff32]
  - @ts-pf/message@0.1.0-beta.0
  - @ts-pf/protocol@0.1.0-beta.0
  - @ts-pf/server@0.1.0-beta.0
