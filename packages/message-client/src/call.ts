import {
  type CallFrame,
  createPushQueue,
  errorFromEnvelope,
  type InItemFrame,
  type MessageFrame,
  type PushQueue,
  type SendResult,
} from '@ts-pf/message'
import { isPFError, localFailure, type PFError } from '@ts-pf/protocol'
import { abortedFailure, isItemStream } from './shared.js'

/** What one call needs from its connection; `DuplexLink` provides it. */
export type ClientCallHost = {
  send(frame: MessageFrame): SendResult
  /** The id reached a terminal state: forget it. */
  settle(id: string): void
}

/** `PROTOCOL.md` "First frame (client)" and "streaming-out". */
type Mode = 'pending-first' | 'streaming-out' | 'done'

function asCallError(error: unknown): PFError {
  if (isPFError(error)) {
    return error
  }
  return error instanceof Error
    ? localFailure(error.message, error)
    : localFailure('Input stream failed', error)
}

/** A frame of ours that could not go out, as the error the caller sees. */
function sendFailure(reason: 'oversize' | 'stringify' | 'closed'): PFError {
  if (reason === 'oversize') {
    return errorFromEnvelope({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Frame too large',
    })
  }
  if (reason === 'stringify') {
    return errorFromEnvelope({
      code: 'INTERNAL',
      message: 'Internal server error',
    })
  }
  return localFailure('Connection closed')
}

/**
 * One in-flight id on the client side: the call promise until the first
 * inbound frame, then (for an output stream) the iterator the promise
 * resolved to, plus the `in-item` pump of a streamed input and the abort
 * listener. Settles exactly once. Frame routing stays in `DuplexLink`.
 */
export class ClientCall {
  private mode: Mode = 'pending-first'
  private sendingInput = false
  private output: PushQueue<unknown> | undefined
  private inputIterator: AsyncIterator<unknown> | undefined
  private unsubAbort: (() => void) | undefined

  constructor(
    readonly id: string,
    private readonly host: ClientCallHost,
    private readonly resolve: (value: unknown) => void,
    private readonly reject: (error: PFError) => void,
  ) {}

  /** Send `call`, arm `signal`, and start pumping `in-item` / `in-done` for an input stream. */
  open(path: string[], input: unknown, signal?: AbortSignal): void {
    const streaming = isItemStream(input)
    const frame: CallFrame = { type: 'call', id: this.id, path }
    if (streaming) {
      frame.stream = true
    } else if (input !== undefined) {
      frame.input = input
    }
    const sent = this.host.send(frame)
    if (!sent.ok) {
      this.fail(sendFailure(sent.reason), false)
      return
    }

    if (signal !== undefined) {
      const onAbort = (): void => {
        this.fail(abortedFailure(signal), true)
      }
      signal.addEventListener('abort', onAbort)
      this.unsubAbort = () => {
        signal.removeEventListener('abort', onAbort)
      }
      if (signal.aborted) {
        onAbort()
        return
      }
    }

    if (streaming) {
      this.sendingInput = true
      this.inputIterator = input[Symbol.asyncIterator]()
      void this.pumpInput()
    }
  }

  /** An inbound frame carrying this id. */
  onFrame(frame: MessageFrame): void {
    if (this.mode === 'done') {
      return
    }
    if (this.mode === 'streaming-out') {
      this.onStreamFrame(frame)
      return
    }
    if (frame.type === 'result') {
      if (frame.ok) {
        this.finish(() => {
          this.resolve(frame.output)
        })
        return
      }
      this.fail(errorFromEnvelope(frame.error), false)
      return
    }
    if (frame.type === 'item') {
      this.mode = 'streaming-out'
      const queue = createPushQueue<unknown>()
      this.output = queue
      queue.push(frame.output)
      this.resolve(this.wrapOutput(queue))
      return
    }
    if (frame.type === 'done') {
      const queue = createPushQueue<unknown>()
      this.output = queue
      queue.end()
      this.resolve(this.wrapOutput(queue))
      this.finish(() => {})
      return
    }
    this.fail(localFailure('Invalid response'), false)
  }

  /**
   * Settle with `error`: reject the call promise before the first frame,
   * fail the output iterator after it. `sendCancel` tells the server to stop
   * (abort, input pump failure); a peer close or server `result` does not.
   */
  fail(error: PFError, sendCancel: boolean): void {
    const mode = this.mode
    this.finish(() => {
      if (sendCancel) {
        this.host.send({ type: 'cancel', id: this.id })
      }
      if (mode === 'pending-first') {
        this.reject(error)
        return
      }
      this.output?.fail(error)
    })
  }

  private onStreamFrame(frame: MessageFrame): void {
    if (frame.type === 'item') {
      this.output?.push(frame.output)
      return
    }
    if (frame.type === 'done') {
      this.finish(() => {
        this.output?.end()
      })
      return
    }
    if (frame.type === 'result' && !frame.ok) {
      this.fail(errorFromEnvelope(frame.error), false)
    }
    // result ok:true, extra done, item after done, unknown: ignored
  }

  /** One-shot terminal transition; `action` runs after the id is forgotten. */
  private finish(action: () => void): void {
    if (this.mode === 'done') {
      return
    }
    this.mode = 'done'
    this.sendingInput = false
    this.host.settle(this.id)
    this.unsubAbort?.()
    void Promise.resolve(this.inputIterator?.return?.()).then(
      () => {},
      () => {},
    )
    action()
  }

  /** The iterable the call resolves to; `break` / `return()` / `throw()` send `cancel`. */
  private wrapOutput(queue: PushQueue<unknown>): AsyncIterable<unknown> {
    return {
      [Symbol.asyncIterator]: () => {
        const inner = queue[Symbol.asyncIterator]()
        return {
          next: () => inner.next(),
          return: async () => {
            if (this.mode !== 'done') {
              this.finish(() => {
                this.host.send({ type: 'cancel', id: this.id })
                this.output?.end()
              })
            }
            return { done: true as const, value: undefined }
          },
          throw: async (error: unknown) => {
            if (this.mode !== 'done') {
              this.finish(() => {
                this.host.send({ type: 'cancel', id: this.id })
                this.output?.fail(error)
              })
            }
            throw error
          },
        }
      },
    }
  }

  private async pumpInput(): Promise<void> {
    const iterator = this.inputIterator
    if (iterator === undefined) {
      return
    }
    try {
      while (this.sendingInput) {
        const nextValue = await iterator.next()
        if (!this.sendingInput || this.mode === 'done') {
          return
        }
        if (nextValue.done) {
          this.sendingInput = false
          this.host.send({ type: 'in-done', id: this.id })
          return
        }
        const item: InItemFrame = { type: 'in-item', id: this.id }
        if (nextValue.value !== undefined) {
          item.input = nextValue.value
        }
        const sent = this.host.send(item)
        if (!sent.ok) {
          this.fail(sendFailure(sent.reason), sent.reason !== 'closed')
          return
        }
      }
    } catch (error) {
      if (this.mode === 'done') {
        return
      }
      this.fail(asCallError(error), true)
    }
  }
}
