import {
  type CallFrame,
  type Duplex,
  type ItemFrame,
  type MessageFrame,
  MessageSession,
  type WireError,
} from '@ts-pf/message'
import { isPFError, PFError } from '@ts-pf/protocol'
import {
  type ImplementedRouter,
  lookupProcedure,
  runProcedure,
} from '@ts-pf/server'
import { isAsyncIterable } from './is-async-iterable.js'
import { createPushQueue, type PushQueue } from './push-queue.js'

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
  inputQueue?: PushQueue<unknown>
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function assertItem(value: unknown): void {
  if (isAsyncIterable(value)) {
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

async function dispatchCall(
  router: ImplementedRouter,
  frame: CallFrame,
  rec: ServerInflight,
  context: unknown,
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
  void session.ready.catch(() => {
    // handshake / close rejects ready; bind() does not await it
  })

  function closeIterator(rec: ServerInflight): void {
    const iterator = rec.iterator
    delete rec.iterator
    if (iterator?.return === undefined) {
      return
    }
    void Promise.resolve(iterator.return()).then(
      () => {},
      (error) => {
        if (isPFError(error) || isAbortError(error)) {
          return
        }
        if (options.onError !== undefined) {
          void options.onError(error)
        }
      },
    )
  }

  function abortAll(): void {
    for (const rec of inflight.values()) {
      rec.cancelled = true
      rec.ac.abort()
      rec.inputQueue?.end()
      closeIterator(rec)
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
      if (frame.stream === true) {
        rec.inputQueue = createPushQueue()
      }
      inflight.set(frame.id, rec)
      void runCall(frame, rec)
      return
    }
    if (frame.type === 'in-item' || frame.type === 'in-done') {
      const rec = inflight.get(frame.id)
      if (!rec?.inputQueue) {
        return
      }
      if (frame.type === 'in-done') {
        rec.inputQueue.end()
      } else {
        rec.inputQueue.push(frame.input)
      }
      return
    }
    if (frame.type === 'cancel') {
      const rec = inflight.get(frame.id)
      if (!rec) {
        return
      }
      rec.cancelled = true
      rec.ac.abort()
      rec.inputQueue?.end()
      closeIterator(rec)
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

  async function failCall(
    rec: ServerInflight,
    id: string,
    error: unknown,
  ): Promise<void> {
    if (rec.cancelled) {
      if (
        !isPFError(error) &&
        !isAbortError(error) &&
        options.onError !== undefined
      ) {
        await options.onError(error)
      }
      return
    }
    if (isPFError(error)) {
      sendOutbound(rec, id, {
        type: 'result',
        id,
        ok: false,
        error: error.toJSON(),
      })
      return
    }
    if (options.onError !== undefined) {
      await options.onError(error)
    }
    if (rec.cancelled) {
      return
    }
    sendOutbound(rec, id, {
      type: 'result',
      id,
      ok: false,
      error: { code: 'INTERNAL', message: 'Internal server error' },
    })
  }

  async function emitStream(
    rec: ServerInflight,
    id: string,
    output: AsyncIterable<unknown>,
  ): Promise<void> {
    const iterator = output[Symbol.asyncIterator]()
    rec.iterator = iterator
    try {
      while (true) {
        const next = await iterator.next()
        if (rec.cancelled) {
          return
        }
        if (next.done) {
          sendOutbound(rec, id, { type: 'done', id })
          return
        }
        assertItem(next.value)
        const item: ItemFrame = { type: 'item', id }
        if (next.value !== undefined) {
          item.output = next.value
        }
        if (!sendOutbound(rec, id, item)) {
          closeIterator(rec)
          return
        }
      }
    } catch (error) {
      closeIterator(rec)
      await failCall(rec, id, error)
    }
  }

  async function runCall(frame: CallFrame, rec: ServerInflight): Promise<void> {
    try {
      const output = await dispatchCall(options.router, frame, rec, context)
      if (rec.cancelled) {
        return
      }
      if (isAsyncIterable(output)) {
        await emitStream(rec, frame.id, output)
        return
      }
      sendOutbound(rec, frame.id, {
        type: 'result',
        id: frame.id,
        ok: true,
        ...(output !== undefined ? { output } : {}),
      })
    } catch (error) {
      await failCall(rec, frame.id, error)
    }
  }

  return {
    close: () => {
      session.close()
    },
    ready: session.ready,
  }
}
