import type { Link } from '@ts-pf/client'
import {
  type CallFrame,
  type Duplex,
  errorFromEnvelope,
  localFailure,
  type MessageFrame,
  MessageSession,
} from '@ts-pf/message'

export type LinkOptions = {
  meta?: unknown
  maxFrameBytes?: number
  helloTimeoutMs?: number
}

export type AttachClientOptions = LinkOptions & {
  duplex: Duplex
}

type ClientInflight = {
  resolve: (value: unknown) => void
  reject: (error: ReturnType<typeof localFailure>) => void
  mode: 'pending-first' | 'streaming-out' | 'done'
  sendingInput: boolean
  unsubAbort?: () => void
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  if (
    typeof ReadableStream !== 'undefined' &&
    value instanceof ReadableStream
  ) {
    return false
  }
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
      'function'
  )
}

function abortedFailure(signal: AbortSignal): ReturnType<typeof localFailure> {
  return signal.reason !== undefined
    ? localFailure('Request aborted', signal.reason)
    : localFailure('Request aborted')
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
        finish(id, rec, () => {
          rec.reject(error)
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
    inflight.delete(id)
    rec.unsubAbort?.()
    action()
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
    if (rec === undefined || rec.mode !== 'pending-first') {
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

  async function callInner(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (isAsyncIterable(input)) {
      throw errorFromEnvelope({
        code: 'BAD_REQUEST',
        message: 'Streaming input is not enabled',
      })
    }

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
      if (input !== undefined) {
        frame.input = input
      }
      const sent = session.send(frame)
      if (!sent.ok) {
        finish(id, rec, () => {
          if (sent.reason === 'oversize') {
            rec.reject(
              errorFromEnvelope({
                code: 'PAYLOAD_TOO_LARGE',
                message: 'Frame too large',
              }),
            )
            return
          }
          if (sent.reason === 'stringify') {
            rec.reject(
              errorFromEnvelope({
                code: 'INTERNAL',
                message: 'Internal server error',
              }),
            )
            return
          }
          rec.reject(localFailure('Connection closed'))
        })
        return
      }

      if (signal !== undefined) {
        const abortSignal = signal
        const onAbort = (): void => {
          finish(id, rec, () => {
            session.send({ type: 'cancel', id })
            rec.reject(abortedFailure(abortSignal))
          })
        }
        abortSignal.addEventListener('abort', onAbort)
        rec.unsubAbort = () => {
          abortSignal.removeEventListener('abort', onAbort)
        }
        if (abortSignal.aborted) {
          onAbort()
        }
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
