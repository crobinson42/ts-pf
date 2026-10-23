import {
  type Backpressure,
  type CallFrame,
  createPushQueue,
  DrainWaiter,
  type InDoneFrame,
  type InItemFrame,
  type ItemFrame,
  type MessageFrame,
  type PushQueue,
  type SendResult,
  type WireError,
} from '@ts-pf/message'
import {
  isAsyncIterable,
  isPFError,
  PFError,
  toWireError,
} from '@ts-pf/protocol'
import {
  type CallInterceptor,
  type ImplementedRouter,
  lookupProcedure,
  type ProcedureValidation,
  type RunProcedureOptions,
  runProcedure,
} from '@ts-pf/server'

/** What one call needs from its connection; `attachRouter` provides it. */
export type ServerCallHost = {
  send(frame: MessageFrame): SendResult
  /** The id's terminal frame went out (or was substituted): forget it. */
  settle(id: string): void
  /**
   * `result ok:false` for an id. Settles the id on success; closes the
   * session when even that frame cannot be sent (`PROTOCOL.md` size limits).
   */
  sendResultErr(id: string, error: WireError): void
  onError: ((error: unknown) => void | Promise<void>) | undefined
  backpressure: Backpressure
  /** A call's input queue crossed / drained below its mark: pause / resume reading the duplex (connection-wide). */
  pauseReads(): void
  resumeReads(): void
}

/** A frame of ours went out; `drained` is set when the duplex is above its mark. */
type Sent = { drained?: Promise<void> }

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** Envelope items only: a `ReadableStream` is bytes, not items; it stays a plain JSON value. */
function isItemStream(value: unknown): value is AsyncIterable<unknown> {
  return (
    isAsyncIterable(value) &&
    !(typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
  )
}

function assertItem(value: unknown): void {
  if (isItemStream(value)) {
    throw new PFError({
      code: 'BAD_REQUEST',
      status: 400,
      message: 'Nested streams are not supported',
    })
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    throw new PFError({
      code: 'BAD_REQUEST',
      status: 400,
      message: 'File values are not supported in streams',
    })
  }
}

/** `lookupProcedure` + `runProcedure` for one `call` frame (pipeline steps 2–4). */
export async function dispatchCall(
  router: ImplementedRouter,
  frame: CallFrame,
  call: ServerCall,
  context: unknown,
  interceptors?: readonly CallInterceptor[],
  validation?: ProcedureValidation,
): Promise<unknown> {
  const procedure = lookupProcedure(router, frame.path)
  if (!procedure) {
    throw new PFError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'Procedure not found',
    })
  }
  const rawInput =
    frame.stream === true
      ? call.inputQueue
      : frame.input === null
        ? undefined
        : frame.input
  const runOpts: RunProcedureOptions = { signal: call.signal }
  if (interceptors !== undefined && interceptors.length > 0) {
    runOpts.interceptors = interceptors
  }
  if (validation) {
    runOpts.validation = validation
  }
  return runProcedure(procedure, rawInput, context, runOpts)
}

/**
 * One in-flight id on the server side: the abort signal the handler sees,
 * the `in-item` queue of a `stream: true` call, and the output iterator while
 * `item` frames go out. Emits exactly one terminal frame (`result` or `done`)
 * unless cancelled first. Frame routing stays in `attachRouter`.
 *
 * Backpressure: the input queue is bounded by `highWaterMark` and pauses the
 * duplex through the host; `emitStream` awaits the duplex's drain between
 * items and aborts the call when the peer does not drain in `drainTimeout`.
 */
export class ServerCall {
  readonly inputQueue: PushQueue<unknown> | undefined
  private readonly ac = new AbortController()
  private readonly drain: DrainWaiter
  private cancelled = false
  private iterator: AsyncIterator<unknown> | undefined

  constructor(
    readonly id: string,
    readonly path: string[],
    stream: boolean,
    private readonly host: ServerCallHost,
  ) {
    this.drain = new DrainWaiter(host.backpressure, this)
    this.inputQueue = stream
      ? createPushQueue({
          highWaterMark: host.backpressure.highWaterMark,
          onPause: () => {
            host.pauseReads()
          },
          onResume: () => {
            host.resumeReads()
          },
        })
      : undefined
  }

  get signal(): AbortSignal {
    return this.ac.signal
  }

  /** `in-item` / `in-done` for a `stream: true` call; a unary call ignores them. */
  pushInput(frame: InItemFrame | InDoneFrame, size: number): void {
    if (this.inputQueue === undefined) {
      return
    }
    if (frame.type === 'in-done') {
      this.inputQueue.end()
      return
    }
    this.inputQueue.push(frame.input, size)
  }

  /** `cancel` frame or connection close: the handler stops, no further frames for this id. */
  cancel(): void {
    this.cancelled = true
    this.ac.abort()
    this.inputQueue?.end()
    this.drain.cancel()
    this.closeIterator()
  }

  /** Run the procedure and emit `result`, or `item`* then `done`. Never throws. */
  async run(dispatch: () => Promise<unknown>): Promise<void> {
    try {
      const output = await dispatch()
      if (this.cancelled) {
        return
      }
      if (isItemStream(output)) {
        await this.emitStream(output)
        return
      }
      this.sendOutbound({
        type: 'result',
        id: this.id,
        ok: true,
        ...(output !== undefined ? { output } : {}),
      })
    } catch (error) {
      await this.fail(error)
    }
  }

  private async emitStream(output: AsyncIterable<unknown>): Promise<void> {
    const iterator = output[Symbol.asyncIterator]()
    this.iterator = iterator
    try {
      while (true) {
        const next = await iterator.next()
        if (this.cancelled) {
          return
        }
        if (next.done) {
          this.sendOutbound({ type: 'done', id: this.id })
          return
        }
        assertItem(next.value)
        const item: ItemFrame = { type: 'item', id: this.id }
        if (next.value !== undefined) {
          item.output = next.value
        }
        const sent = this.sendOutbound(item)
        if (sent === false) {
          this.closeIterator()
          return
        }
        if (
          sent.drained !== undefined &&
          !(await this.awaitDrain(sent.drained))
        ) {
          return
        }
      }
    } catch (error) {
      this.closeIterator()
      await this.fail(error)
    }
  }

  /** Hold the producer at its `yield` until the duplex drains; false means stop (timeout or cancel). */
  private async awaitDrain(drained: Promise<void>): Promise<boolean> {
    const outcome = await this.drain.wait(drained)
    if (outcome === 'drained') {
      return !this.cancelled
    }
    if (outcome === 'timeout') {
      this.abortStalled()
    }
    return false
  }

  /**
   * The peer did not drain within `drainTimeout` (`PROTOCOL.md`
   * "Backpressure"): abort the handler's signal, return the iterator once,
   * drop the remaining frames, and tell the peer with a terminal `INTERNAL`
   * `result` if the duplex still accepts one. The connection stays open for
   * other ids. Not a handler failure, so `onError` is not called.
   */
  private abortStalled(): void {
    if (this.cancelled) {
      return
    }
    this.cancelled = true
    this.ac.abort()
    this.inputQueue?.end()
    this.closeIterator()
    this.host.sendResultErr(this.id, {
      code: 'INTERNAL',
      message: `Peer did not drain within ${this.host.backpressure.drainTimeout} ms`,
    })
  }

  /** Report a non-protocol throw to `onError`, then `result ok:false` via `toWireError`. */
  private async fail(error: unknown): Promise<void> {
    if (this.cancelled) {
      if (
        !isPFError(error) &&
        !isAbortError(error) &&
        this.host.onError !== undefined
      ) {
        await this.host.onError(error)
      }
      return
    }
    if (!isPFError(error)) {
      if (this.host.onError !== undefined) {
        await this.host.onError(error)
      }
      if (this.cancelled) {
        return
      }
    }
    this.sendOutbound({
      type: 'result',
      id: this.id,
      ok: false,
      error: toWireError(error),
    })
  }

  /**
   * The one send site for this id. A terminal frame settles the id; an
   * oversize / unserializable frame is replaced by the `PROTOCOL.md`
   * substitute `result` and ends the stream. Returns false to stop, else the
   * send (with `drained` when the duplex is above its mark).
   */
  private sendOutbound(frame: MessageFrame): Sent | false {
    if (this.cancelled) {
      return false
    }
    const sent = this.host.send(frame)
    if (sent.ok) {
      if (frame.type === 'result' || frame.type === 'done') {
        this.host.settle(this.id)
      }
      return sent
    }
    if (sent.reason === 'closed') {
      return false
    }
    const error: WireError =
      sent.reason === 'oversize'
        ? { code: 'PAYLOAD_TOO_LARGE', message: 'Frame too large' }
        : { code: 'INTERNAL', message: 'Internal server error' }
    if (sent.reason === 'stringify' && this.host.onError !== undefined) {
      void this.host.onError(new TypeError('stringify'))
    }
    this.host.sendResultErr(this.id, error)
    return false
  }

  private closeIterator(): void {
    const iterator = this.iterator
    this.iterator = undefined
    if (iterator?.return === undefined) {
      return
    }
    void Promise.resolve(iterator.return()).then(
      () => {},
      (error) => {
        if (isPFError(error) || isAbortError(error)) {
          return
        }
        if (this.host.onError !== undefined) {
          void this.host.onError(error)
        }
      },
    )
  }
}
