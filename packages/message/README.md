# @ts-pf/message

Opt-in JSON text frames and `MessageSession` for message-oriented transports. Not an HTTP codec. Bindings live in [`@ts-pf/message-server`](../message-server) and [`@ts-pf/message-client`](../message-client).

Agent skill: [`skills/ts-pf-message/`](skills/ts-pf-message/). Sync with `npx skills experimental_sync -y`.

`createPortDuplex` / `createWsDuplex` / `WebSocketLike` adapt `MessagePort` and a `WebSocket`-like socket to `Duplex`. Stdio is a subpath:

```ts
import { createPortDuplex, createWsDuplex, type WebSocketLike } from '@ts-pf/message'
import { createStdioDuplex } from '@ts-pf/message/stdio'
```

`createPushQueue()` is the primitive a transport adapter uses to turn frames into an `AsyncIterable`: `push(value)` from a frame callback, `end()` to complete, `fail(error)` to reject the next pull. Both closes are one-shot. `@ts-pf/message-server` (streamed input) and `@ts-pf/message-client` (streamed output) use it; so can a custom `Duplex` binding. A custom `Duplex` does not need it directly: `DuplexHandler` (`@ts-pf/message-server`) and `DuplexLink` (`@ts-pf/message-client`) own the queues and multiplexing.

```ts
import { createPushQueue } from '@ts-pf/message'

const items = createPushQueue<number>()
items.push(1)
items.push(2)
items.end() // or items.fail(error)
for await (const item of items) console.log(item) // 1, 2
```

## Backpressure

Nothing changes on the wire; the pipe reports pressure and the sender slows down. `Duplex.send` may return a promise: the pipe is above its write high-water mark and the sender must not pull the next item of that stream until it resolves (it must settle when the duplex closes; a rejection closes the session). `createStdioDuplex` returns one when `output.write()` is refused and resolves it on `'drain'`; `createWsDuplex(socket, { highWaterMark })` (default 1 MiB) returns one while `socket.bufferedAmount` is over the mark (polled every 10 ms) or while frames queue during `CONNECTING`; `createPortDuplex` never does — a `MessagePort` has no buffer signal, so a port cannot report backpressure. A `Duplex` may also implement `pause()` / `resume()` so a receiver can stop reading while a per-call queue is over its mark (pausing is connection-wide): stdio pauses the `Readable`, ws forwards the socket's own `pause` / `resume` when it has them (npm `ws` does; browsers do not), a port cannot. `createMemoryDuplex({ highWaterMark })` simulates a slow peer for tests; without the option it stays synchronous.

`BackpressureOptions` is the one option object `@ts-pf/message-server` (`HandlerOptions.backpressure`) and `@ts-pf/message-client` (`LinkOptions.backpressure`) take; protection is on by default:

```ts
import type { BackpressureOptions, StallInfo } from '@ts-pf/message'

const backpressure: BackpressureOptions = {
  highWaterMark: 1024 * 1024, // bytes buffered before a sender pauses; also the per-call receive-queue bound (frame text length). Infinity disables
  drainTimeout: 30_000, // ms a paused sender waits before the call is aborted; 0 waits forever
  onStall: (info: StallInfo) => console.warn(info.path.join('.'), info.action, info.waitedMs), // or false
}
```

`resolveBackpressure(options)` applies those defaults and validates them (a `TypeError` naming the option); `DrainWaiter` is the per-call wait the two bindings use (first pause → `onStall('paused')` once, timeout → `onStall('aborted')`). `createPushQueue({ highWaterMark, onPause, onResume })` (`PushQueueOptions`) bounds the queue: `push(value, size)` counts `size` (default 1) against the mark, `onPause` fires once above it, `onResume` once the consumer drains it to half or on `end` / `fail`; nothing is dropped.

`localFailure` is still re-exported for compatibility but is deprecated — import it from `@ts-pf/protocol`.

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (Message transports).

## API

- `MessageSession`, `Duplex`, `encodeFrame`, `decodeFrame`
- `createMemoryDuplex`, `createPortDuplex`, `createWsDuplex`, `WebSocketLike`
- `createPushQueue`, `PushQueue`, `PushQueueOptions`
- `BackpressureOptions`, `StallInfo`, `resolveBackpressure`, `Backpressure`, `DrainWaiter`, `DrainOutcome`
- `errorFromEnvelope`; `localFailure` (deprecated re-export — use `@ts-pf/protocol`)
- `createStdioDuplex` from `./stdio` only
