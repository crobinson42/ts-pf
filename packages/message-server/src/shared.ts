import {
  type CallFrame,
  type Duplex,
  type MessageFrame,
  MessageSession,
  type WireError,
} from '@ts-pf/message'
import type {
  CallInterceptor,
  ImplementedRouter,
  ProcedureValidation,
} from '@ts-pf/server'
import { dispatchCall, ServerCall, type ServerCallHost } from './call.js'

export type HandlerOptions = {
  maxFrameBytes?: number
  helloTimeoutMs?: number
  onError?: (error: unknown) => void | Promise<void>
  interceptors?: readonly CallInterceptor[]
  validation?: ProcedureValidation
}

export type AttachRouterOptions<TCtx = unknown> = HandlerOptions & {
  duplex: Duplex
  router: ImplementedRouter
  context: TCtx | ((info: { meta?: unknown }) => TCtx | Promise<TCtx>)
}

/**
 * Adds a transport's bind-time connection info (`port`, `socket`, stdio
 * streams) to the `{ meta }` context factory `attachRouter` calls on hello.
 * A context value passes through unchanged.
 */
export function contextWithInfo<TCtx, TInfo extends object>(
  context: TCtx | ((info: TInfo & { meta?: unknown }) => TCtx | Promise<TCtx>),
  info: TInfo,
): TCtx | ((info: { meta?: unknown }) => TCtx | Promise<TCtx>) {
  if (typeof context !== 'function') {
    return context
  }
  const factory = context as (
    info: TInfo & { meta?: unknown },
  ) => TCtx | Promise<TCtx>
  return ({ meta }) =>
    meta !== undefined ? factory({ ...info, meta }) : factory({ ...info })
}

/**
 * The server-side multiplexer: one `MessageSession` over `duplex`, an
 * `inflight` map of ids to `ServerCall`s, and the `PROTOCOL.md` "Multiplex"
 * rules for routing each frame to one of them. Context is created once per
 * connection in `onHello`; `onFrame` returns without awaiting `runProcedure`.
 */
export function attachRouter<TCtx = unknown>(
  options: AttachRouterOptions<TCtx>,
): { close(): void; ready: Promise<void> } {
  let context!: TCtx
  const inflight = new Map<string, ServerCall>()

  const session = new MessageSession({
    duplex: options.duplex,
    role: 'server',
    ...(options.maxFrameBytes !== undefined
      ? { maxFrameBytes: options.maxFrameBytes }
      : {}),
    ...(options.helloTimeoutMs !== undefined
      ? { helloTimeoutMs: options.helloTimeoutMs }
      : {}),
    // A value context settles without an await: the stdio duplex closes one
    // microtask after a trailing partial line, and hello-ok must beat it.
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

  const host: ServerCallHost = {
    send: (frame) => session.send(frame),
    settle: (id) => {
      inflight.delete(id)
    },
    sendResultErr,
    onError: options.onError,
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

  /** Invalid frame with a usable id: `BAD_REQUEST` unless that id is in flight. */
  function handleInvalid(info: { id: string; message: string }): void {
    if (inflight.has(info.id)) {
      return
    }
    sendResultErr(info.id, { code: 'BAD_REQUEST', message: info.message })
  }

  function handleFrame(frame: MessageFrame): void {
    switch (frame.type) {
      case 'call':
        startCall(frame)
        return
      case 'in-item':
      case 'in-done':
        inflight.get(frame.id)?.pushInput(frame)
        return
      case 'cancel': {
        const call = inflight.get(frame.id)
        if (call === undefined) {
          return
        }
        call.cancel()
        inflight.delete(frame.id)
        return
      }
      case 'hello':
      case 'hello-ok':
      case 'hello-error':
        session.close()
        return
      default:
        // wrong-direction frame: ignore for an in-flight id, else terminal BAD_REQUEST
        if (inflight.has(frame.id)) {
          return
        }
        sendResultErr(frame.id, {
          code: 'BAD_REQUEST',
          message: 'Unexpected frame',
        })
    }
  }

  /** A duplicate `call` for an in-flight id is ignored (never a second terminal frame). */
  function startCall(frame: CallFrame): void {
    if (inflight.has(frame.id)) {
      return
    }
    const call = new ServerCall(frame.id, frame.stream === true, host)
    inflight.set(frame.id, call)
    void call.run(() =>
      dispatchCall(
        options.router,
        frame,
        call,
        context,
        options.interceptors,
        options.validation,
      ),
    )
  }

  function abortAll(): void {
    for (const call of inflight.values()) {
      call.cancel()
    }
    inflight.clear()
  }

  return {
    close: () => {
      session.close()
    },
    ready: session.ready,
  }
}
