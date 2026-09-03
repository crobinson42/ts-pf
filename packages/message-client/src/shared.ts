import type { Link } from '@ts-pf/client'
import {
  type CallFrame,
  type Duplex,
  errorFromEnvelope,
  type InItemFrame,
  localFailure,
  type MessageFrame,
  MessageSession,
} from '@ts-pf/message'
import { isAsyncIterable } from './is-async-iterable.js'
import { createPushQueue, type PushQueue } from './push-queue.js'

export type LinkOptions = {
  meta?: unknown
  maxFrameBytes?: number
  helloTimeoutMs?: number
}

export type AttachClientOptions = LinkOptions & {
  duplex: Duplex
}

type CallError = ReturnType<typeof errorFromEnvelope>

type ClientInflight = {
  resolve: (value: unknown) => void
  reject: (error: CallError) => void
  mode: 'pending-first' | 'streaming-out' | 'done'
  sendingInput: boolean
  output?: PushQueue<unknown>
  inputIterator?: AsyncIterator<unknown>
  unsubAbort?: () => void
}

function abortedFailure(signal: AbortSignal): CallError {
  return signal.reason !== undefined
    ? localFailure('Request aborted', signal.reason)
    : localFailure('Request aborted')
}

function asCallError(error: unknown): CallError {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    'status' in error
  ) {
    return error as CallError
  }
  return error instanceof Error
    ? localFailure(error.message, error)
    : localFailure('Input stream failed', error)
}

function sendFailure(reason: 'oversize' | 'stringify' | 'closed'): CallError {
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

export function attachClient(options: AttachClientOptions): {
  call(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): ReturnType<Link['call']>
  close(): void
} {
  let next = 1
  let closed = false
  const inflight = new Map<string, ClientInflight>()

  const session = new MessageSession({
    duplex: options.duplex,
    role: 'client',
    ...(options.maxFrameBytes !== undefined
      ? { maxFrameBytes: options.maxFrameBytes }
      : {}),
    ...(options.helloTimeoutMs !== undefined
      ? { helloTimeoutMs: options.helloTimeoutMs }
      : {}),
    ...(options.meta !== undefined ? { helloMeta: options.meta } : {}),
    onFrame: (frame) => {
      handleFrame(frame)
    },
    // decode failures never settle a call, in-flight or not
    onInvalidFrame: () => {},
    onClose: (reason) => {
      closed = true
      const error =
        reason === undefined
          ? localFailure('Connection closed')
          : localFailure('Connection closed', reason)
      for (const [id, rec] of [...inflight]) {
        const mode = rec.mode
        finish(id, rec, () => {
          if (mode === 'pending-first') {
            rec.reject(error)
            return
          }
          rec.output?.fail(error)
        })
      }
    },
  })
  void session.ready.catch(() => {
    // handshake / close rejects ready; call() re-awaits the same promise
  })

  function finish(id: string, rec: ClientInflight, action: () => void): void {
    if (rec.mode === 'done') {
      return
    }
    rec.mode = 'done'
    rec.sendingInput = false
    inflight.delete(id)
    rec.unsubAbort?.()
    void Promise.resolve(rec.inputIterator?.return?.()).then(
      () => {},
      () => {},
    )
    action()
  }

  function wrapOutput(
    id: string,
    rec: ClientInflight,
    queue: PushQueue<unknown>,
  ): AsyncIterable<unknown> {
    return {
      [Symbol.asyncIterator]() {
        const inner = queue[Symbol.asyncIterator]()
        return {
          next: () => inner.next(),
          async return() {
            if (rec.mode !== 'done') {
              finish(id, rec, () => {
                session.send({ type: 'cancel', id })
                rec.output?.end()
              })
            }
            return { done: true as const, value: undefined }
          },
          async throw(error) {
            if (rec.mode !== 'done') {
              finish(id, rec, () => {
                session.send({ type: 'cancel', id })
                rec.output?.fail(error)
              })
            }
            throw error
          },
        }
      },
    }
  }

  function handleStreamingOut(frame: MessageFrame, rec: ClientInflight): void {
    if (frame.type === 'item') {
      rec.output?.push(frame.output)
      return
    }
    if (frame.type === 'done') {
      finish(frame.id, rec, () => {
        rec.output?.end()
      })
      return
    }
    if (frame.type === 'result' && !frame.ok) {
      finish(frame.id, rec, () => {
        rec.output?.fail(errorFromEnvelope(frame.error))
      })
    }
  }

  function handleFrame(frame: MessageFrame): void {
    if (
      frame.type === 'hello' ||
      frame.type === 'hello-ok' ||
      frame.type === 'hello-error'
    ) {
      session.close()
      return
    }
    const rec = inflight.get(frame.id)
    if (rec === undefined || rec.mode === 'done') {
      return
    }
    if (rec.mode === 'streaming-out') {
      handleStreamingOut(frame, rec)
      return
    }
    if (frame.type === 'result') {
      finish(frame.id, rec, () => {
        if (frame.ok) {
          rec.resolve(frame.output)
        } else {
          rec.reject(errorFromEnvelope(frame.error))
        }
      })
      return
    }
    if (frame.type === 'item') {
      rec.mode = 'streaming-out'
      const queue = createPushQueue()
      rec.output = queue
      queue.push(frame.output)
      rec.resolve(wrapOutput(frame.id, rec, queue))
      return
    }
    if (frame.type === 'done') {
      const queue = createPushQueue()
      rec.output = queue
      queue.end()
      rec.resolve(wrapOutput(frame.id, rec, queue))
      finish(frame.id, rec, () => {})
      return
    }
    finish(frame.id, rec, () => {
      rec.reject(localFailure('Invalid response'))
    })
  }

  function waitForReady(signal?: AbortSignal): Promise<void> {
    if (signal === undefined) {
      return session.ready
    }
    if (signal.aborted) {
      return Promise.reject(abortedFailure(signal))
    }
    return new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        signal.removeEventListener('abort', onAbort)
        reject(abortedFailure(signal))
      }
      signal.addEventListener('abort', onAbort)
      session.ready.then(
        () => {
          signal.removeEventListener('abort', onAbort)
          if (signal.aborted) {
            reject(abortedFailure(signal))
            return
          }
          resolve()
        },
        (error) => {
          signal.removeEventListener('abort', onAbort)
          if (signal.aborted) {
            reject(abortedFailure(signal))
            return
          }
          reject(error)
        },
      )
    })
  }

  async function pumpInput(id: string, rec: ClientInflight): Promise<void> {
    const iterator = rec.inputIterator
    if (iterator === undefined) {
      return
    }
    try {
      while (rec.sendingInput) {
        const nextValue = await iterator.next()
        const mode = rec.mode
        if (!rec.sendingInput || mode === 'done') {
          return
        }
        if (nextValue.done) {
          rec.sendingInput = false
          session.send({ type: 'in-done', id })
          return
        }
        const item: InItemFrame = { type: 'in-item', id }
        if (nextValue.value !== undefined) {
          item.input = nextValue.value
        }
        const sent = session.send(item)
        if (!sent.ok) {
          const mode = rec.mode
          finish(id, rec, () => {
            if (sent.reason !== 'closed') {
              session.send({ type: 'cancel', id })
            }
            const error = sendFailure(sent.reason)
            if (mode === 'pending-first') {
              rec.reject(error)
              return
            }
            rec.output?.fail(error)
          })
          return
        }
      }
    } catch (error) {
      if (rec.mode === 'done') {
        return
      }
      const mode = rec.mode
      finish(id, rec, () => {
        session.send({ type: 'cancel', id })
        const mapped = asCallError(error)
        if (mode === 'pending-first') {
          rec.reject(mapped)
          return
        }
        rec.output?.fail(mapped)
      })
    }
  }

  async function callInner(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const streamingInput = isAsyncIterable(input)

    await waitForReady(signal)

    if (closed) {
      throw localFailure('Connection closed')
    }

    if (signal?.aborted) {
      throw abortedFailure(signal)
    }

    const id = String(next)
    next += 1

    return new Promise<unknown>((resolve, reject) => {
      const rec: ClientInflight = {
        resolve,
        reject,
        mode: 'pending-first',
        sendingInput: false,
      }

      if (signal?.aborted) {
        reject(abortedFailure(signal))
        return
      }

      inflight.set(id, rec)

      const frame: CallFrame = { type: 'call', id, path }
      if (streamingInput) {
        frame.stream = true
      } else if (input !== undefined) {
        frame.input = input
      }
      const sent = session.send(frame)
      if (!sent.ok) {
        finish(id, rec, () => {
          rec.reject(sendFailure(sent.reason))
        })
        return
      }

      if (signal !== undefined) {
        const abortSignal = signal
        const onAbort = (): void => {
          const mode = rec.mode
          finish(id, rec, () => {
            session.send({ type: 'cancel', id })
            const error = abortedFailure(abortSignal)
            if (mode === 'pending-first') {
              rec.reject(error)
              return
            }
            rec.output?.fail(error)
          })
        }
        abortSignal.addEventListener('abort', onAbort)
        rec.unsubAbort = () => {
          abortSignal.removeEventListener('abort', onAbort)
        }
        if (abortSignal.aborted) {
          onAbort()
          return
        }
      }

      if (streamingInput) {
        rec.sendingInput = true
        rec.inputIterator = input[Symbol.asyncIterator]()
        void pumpInput(id, rec)
      }
    })
  }

  return {
    call(path, input, signal) {
      return callInner(path, input, signal) as ReturnType<Link['call']>
    },
    close() {
      session.close()
    },
  }
}
