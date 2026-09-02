import {
  type CallFrame,
  type Duplex,
  type MessageFrame,
  MessageSession,
  type WireError,
} from '@ts-pf/message'
import {
  type ImplementedRouter,
  lookupProcedure,
  runProcedure,
} from '@ts-pf/server'
import { isAsyncIterable } from './is-async-iterable.js'

export type HandlerOptions = {
  maxFrameBytes?: number
  helloTimeoutMs?: number
  onError?: (error: unknown) => void | Promise<void>
}

export type AttachRouterOptions<TCtx = unknown> = HandlerOptions & {
  duplex: Duplex
  router: ImplementedRouter
  context: TCtx | ((info: { meta?: unknown }) => TCtx | Promise<TCtx>)
}

type ServerInflight = {
  ac: AbortController
  cancelled: boolean
  startedItems: boolean
  iterator?: AsyncIterator<unknown>
  inputQueue?: AsyncIterable<unknown>
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

// message-server must not depend on @ts-pf/protocol; PFError is name + toJSON.
function envelopeFromError(error: unknown): WireError | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    (error as { name?: unknown }).name !== 'PFError' ||
    typeof (error as { toJSON?: unknown }).toJSON !== 'function'
  ) {
    return undefined
  }
  const json = (error as { toJSON: () => unknown }).toJSON()
  if (
    typeof json !== 'object' ||
    json === null ||
    typeof (json as { code?: unknown }).code !== 'string' ||
    typeof (json as { message?: unknown }).message !== 'string'
  ) {
    return undefined
  }
  const envelope: WireError = {
    code: (json as { code: string }).code,
    message: (json as { message: string }).message,
  }
  if ('data' in json && (json as { data?: unknown }).data !== undefined) {
    envelope.data = (json as { data: unknown }).data
  }
  return envelope
}

function notFoundError(): never {
  const error = new Error('Procedure not found')
  error.name = 'PFError'
  throw Object.assign(error, {
    code: 'NOT_FOUND',
    status: 404,
    toJSON: (): WireError => ({
      code: 'NOT_FOUND',
      message: 'Procedure not found',
    }),
  })
}

async function dispatchCall(
  router: ImplementedRouter,
  frame: CallFrame,
  rec: ServerInflight,
  context: unknown,
): Promise<unknown> {
  const procedure = lookupProcedure(router, frame.path)
  if (!procedure) {
    notFoundError()
  }
  const rawInput =
    frame.stream === true
      ? rec.inputQueue
      : frame.input === null
        ? undefined
        : frame.input
  return runProcedure(procedure, rawInput, context, rec.ac.signal)
}

export function attachRouter<TCtx = unknown>(
  options: AttachRouterOptions<TCtx>,
): { close(): void; ready: Promise<void> } {
  let context!: TCtx
  const inflight = new Map<string, ServerInflight>()

  const session = new MessageSession({
    duplex: options.duplex,
    role: 'server',
    ...(options.maxFrameBytes !== undefined
      ? { maxFrameBytes: options.maxFrameBytes }
      : {}),
    ...(options.helloTimeoutMs !== undefined
      ? { helloTimeoutMs: options.helloTimeoutMs }
      : {}),
    onHello: async (meta) => {
      try {
        if (typeof options.context === 'function') {
          const factory = options.context as (info: {
            meta?: unknown
          }) => TCtx | Promise<TCtx>
          context =
            meta !== undefined ? await factory({ meta }) : await factory({})
        } else {
          context = options.context
        }
      } catch (error) {
        if (options.onError !== undefined) {
          await options.onError(error)
        }
        throw error
      }
    },
    onFrame: (frame) => {
      handleFrame(frame)
    },
    onInvalidFrame: (info) => {
      handleInvalid(info)
    },
    onClose: () => {
      abortAll()
    },
  })

  function abortAll(): void {
    for (const rec of inflight.values()) {
      rec.cancelled = true
      rec.ac.abort()
      void rec.iterator?.return?.()
    }
    inflight.clear()
  }

  function sendResultErr(id: string, error: WireError): void {
    const sent = session.send({
      type: 'result',
      id,
      ok: false,
      error,
    })
    if (sent.ok) {
      inflight.delete(id)
      return
    }
    if (sent.reason === 'closed') {
      return
    }
    session.close()
  }

  function sendOutbound(
    rec: ServerInflight,
    id: string,
    frame: MessageFrame,
  ): boolean {
    if (rec.cancelled) {
      return false
    }
    const sent = session.send(frame)
    if (sent.ok) {
      if (frame.type === 'item') {
        rec.startedItems = true
      }
      if (frame.type === 'result' || frame.type === 'done') {
        inflight.delete(id)
      }
      return true
    }
    if (sent.reason === 'closed') {
      return false
    }
    const error: WireError =
      sent.reason === 'oversize'
        ? { code: 'PAYLOAD_TOO_LARGE', message: 'Frame too large' }
        : { code: 'INTERNAL', message: 'Internal server error' }
    if (sent.reason === 'stringify' && options.onError !== undefined) {
      void options.onError(new TypeError('stringify'))
    }
    sendResultErr(id, error)
    return false
  }

  function handleInvalid(info: { id: string; message: string }): void {
    if (inflight.has(info.id)) {
      return
    }
    sendResultErr(info.id, { code: 'BAD_REQUEST', message: info.message })
  }

  function handleFrame(frame: MessageFrame): void {
    if (frame.type === 'call') {
      if (inflight.has(frame.id)) {
        return
      }
      const rec: ServerInflight = {
        ac: new AbortController(),
        cancelled: false,
        startedItems: false,
      }
      inflight.set(frame.id, rec)
      void runCall(frame, rec)
      return
    }
    if (frame.type === 'cancel') {
      const rec = inflight.get(frame.id)
      if (!rec) {
        return
      }
      rec.cancelled = true
      rec.ac.abort()
      void rec.iterator?.return?.()
      inflight.delete(frame.id)
      return
    }
    if (
      frame.type === 'hello' ||
      frame.type === 'hello-ok' ||
      frame.type === 'hello-error'
    ) {
      session.close()
      return
    }
    if (inflight.has(frame.id)) {
      return
    }
    sendResultErr(frame.id, {
      code: 'BAD_REQUEST',
      message: 'Unexpected frame',
    })
  }

  async function runCall(frame: CallFrame, rec: ServerInflight): Promise<void> {
    if (frame.stream === true) {
      if (rec.cancelled) {
        return
      }
      sendOutbound(rec, frame.id, {
        type: 'result',
        id: frame.id,
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Streaming input is not enabled',
        },
      })
      return
    }
    try {
      const output = await dispatchCall(options.router, frame, rec, context)
      if (rec.cancelled) {
        return
      }
      if (isAsyncIterable(output)) {
        const iterator = output[Symbol.asyncIterator]()
        rec.iterator = iterator
        try {
          await iterator.return?.()
        } finally {
          if (!rec.cancelled) {
            sendOutbound(rec, frame.id, {
              type: 'result',
              id: frame.id,
              ok: false,
              error: {
                code: 'INTERNAL',
                message: 'Streaming output is not enabled',
              },
            })
          }
        }
        return
      }
      sendOutbound(rec, frame.id, {
        type: 'result',
        id: frame.id,
        ok: true,
        ...(output !== undefined ? { output } : {}),
      })
    } catch (error) {
      const envelope = envelopeFromError(error)
      if (rec.cancelled) {
        if (
          envelope === undefined &&
          !isAbortError(error) &&
          options.onError !== undefined
        ) {
          await options.onError(error)
        }
        return
      }
      if (envelope !== undefined) {
        sendOutbound(rec, frame.id, {
          type: 'result',
          id: frame.id,
          ok: false,
          error: envelope,
        })
        return
      }
      if (options.onError !== undefined) {
        await options.onError(error)
      }
      if (rec.cancelled) {
        return
      }
      sendOutbound(rec, frame.id, {
        type: 'result',
        id: frame.id,
        ok: false,
        error: { code: 'INTERNAL', message: 'Internal server error' },
      })
    }
  }

  return {
    close: () => {
      session.close()
    },
    ready: session.ready,
  }
}
