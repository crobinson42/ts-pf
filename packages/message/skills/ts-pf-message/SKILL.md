---
name: ts-pf-message
description: Use when framing ts-pf over JSON text frames with MessageSession, Duplex, createPortDuplex, createWsDuplex, or createPushQueue, or configuring message backpressure. Triggers: @ts-pf/message, MessageSession, encodeFrame, decodeFrame, createStdioDuplex, createMemoryDuplex, createPushQueue, BackpressureOptions, onStall.
---

# @ts-pf/message

Opt-in JSON text frames and `MessageSession`. Not an HTTP codec.

Install: `npm i @ts-pf/message`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { createPortDuplex, createWsDuplex, type WebSocketLike } from '@ts-pf/message'
import { createStdioDuplex } from '@ts-pf/message/stdio'
```

Bindings live in `@ts-pf/message-server` / `@ts-pf/message-client`. Inject a `WebSocket` constructor — do not depend on the `ws` npm package. User owns listen / upgrade / spawn / Worker bootstrap.

`errorFromEnvelope({ code, message, data? })` builds a `PFError` with `status` left `undefined` — frames carry no HTTP status and none is synthesized. Switch on `code`.

`createPushQueue<T>()` turns frames into an `AsyncIterable<T>` for a custom binding: `push(value, size?)` from the frame callback, `end()` to complete after the buffered values, `fail(error)` to reject the next pull instead. One pending `next()` at a time (one `for await` consumer); `end` / `fail` are one-shot and later calls are ignored. `createPushQueue({ highWaterMark, onPause, onResume })` bounds it: `onPause` once the buffered `size` sum passes the mark, `onResume` once drained to half or on `end` / `fail`; nothing is dropped. The first-party server (streamed input) and client (streamed output) use the same queue.

Backpressure is the pipe's job, not the wire's. A `Duplex.send` may return a promise ("above the write high-water mark, do not pull the next item until this resolves"; it must settle on close) and may implement `pause()` / `resume()` (stop delivering `onMessage` while a receiver's per-call queue is over its mark; connection-wide). stdio does both from the Node streams; `createWsDuplex(socket, { highWaterMark })` (default 1 MiB) polls `bufferedAmount` every 10 ms and forwards the socket's `pause` / `resume` when present (npm `ws`); `createPortDuplex` reports nothing (a `MessagePort` has no buffer signal). `createMemoryDuplex({ highWaterMark })` simulates a slow peer in tests.

`BackpressureOptions` is the shared `{ highWaterMark?, drainTimeout?, onStall? }` that `HandlerOptions.backpressure` / `LinkOptions.backpressure` take (defaults 1 MiB / 30 s / one `console.warn` on `aborted` only; `false` silences; `0` waits forever; `Infinity` unbounds). `onStall` sees `paused` once per call and `aborted` on timeout; a throw from it is swallowed. The bindings validate it (`TypeError` naming the option) and share an `@internal` per-call drain wait — a custom `Duplex` needs neither.

`localFailure` is a deprecated re-export; import it from `@ts-pf/protocol`.

## API

- `MessageSession`, `Duplex`, `encodeFrame`, `decodeFrame`
- `createMemoryDuplex`, `createPortDuplex`, `createWsDuplex`, `WebSocketLike`
- `createPushQueue`, `PushQueue`, `PushQueueOptions`
- `BackpressureOptions`, `StallInfo`
- `errorFromEnvelope`; `localFailure` (deprecated — use `@ts-pf/protocol`)
- `createStdioDuplex` from `./stdio` only

## Pair with

- Server: `ts-pf-message-server`
- Client: `ts-pf-message-client`
- Wire: `@ts-pf/protocol` `PROTOCOL.md` (Message transports)

## Don't

- Use this as an HTTP `RpcCodec`.
- Depend on the `ws` npm package — inject a `WebSocket` constructor.
- Reconstruct HTTP status from `error.code` on this pipe.
- Share one `PushQueue` between two `for await` loops — it holds one pending pull.
- Return a `send` promise that never settles — it must resolve on close, or a stream hangs until `drainTimeout`.
- Add credit / ack frames for flow control — that is a wire-major change, not a duplex concern.
