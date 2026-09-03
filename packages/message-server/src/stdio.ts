import type { Readable, Writable } from 'node:stream'
import type { Duplex } from '@ts-pf/message'
import type { ImplementedRouter } from '@ts-pf/server'
import { attachRouter, type HandlerOptions } from './shared.js'

// child (handler)
// new StdioHandler(app).bind({ input: process.stdin, output: process.stdout }, { context })
// parent (link)
// const child = spawn(cmd, { stdio: ['pipe', 'pipe', 'inherit'] })
// new StdioLink({ input: child.stdout, output: child.stdin })

function asBuffer(chunk: unknown): Buffer {
  if (typeof chunk === 'string') {
    return Buffer.from(chunk, 'utf8')
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk)
  }
  return Buffer.from(String(chunk), 'utf8')
}

function createStdioDuplex(
  streams: { input: Readable; output: Writable },
  options: { maxFrameBytes?: number } = {},
): Duplex {
  const { input, output } = streams
  const closeHandlers = new Set<(reason?: unknown) => void>()
  const messageHandlers = new Set<(text: string) => void>()
  let closed = false
  let pending = Buffer.alloc(0)

  const notifyClose = (reason?: unknown): void => {
    for (const handler of [...closeHandlers]) {
      if (reason === undefined) {
        handler()
      } else {
        handler(reason)
      }
    }
  }

  const deliver = (text: string): void => {
    for (const handler of [...messageHandlers]) {
      handler(text)
    }
  }

  const close = (reason?: unknown): void => {
    if (closed) {
      return
    }
    closed = true
    pending = Buffer.alloc(0)
    input.removeListener('data', onData)
    input.removeListener('end', onEnd)
    input.removeListener('close', onInputClose)
    try {
      if (!input.destroyed) {
        input.destroy()
      }
    } catch {
      // already disconnected
    }
    try {
      if (!output.destroyed && output.writable) {
        output.end()
      }
    } catch {
      // already disconnected
    }
    input.removeListener('error', onInputError)
    output.removeListener('error', onOutputError)
    notifyClose(reason)
  }

  const exceedsMax = (buffer: Buffer): boolean =>
    options.maxFrameBytes !== undefined && buffer.length > options.maxFrameBytes

  const onData = (chunk: unknown): void => {
    if (closed) {
      return
    }
    pending = Buffer.concat([pending, asBuffer(chunk)])
    while (!closed) {
      const idx = pending.indexOf(0x0a)
      if (idx === -1) {
        if (exceedsMax(pending)) {
          pending = Buffer.alloc(0)
          close()
        }
        return
      }
      const raw = pending.subarray(0, idx)
      pending = Buffer.from(pending.subarray(idx + 1))
      const line = raw.toString('utf8').trim()
      if (line.length === 0) {
        continue
      }
      deliver(line)
    }
  }

  const onEnd = (): void => {
    if (closed) {
      return
    }
    if (exceedsMax(pending)) {
      pending = Buffer.alloc(0)
      close()
      return
    }
    const line = pending.toString('utf8').trim()
    pending = Buffer.alloc(0)
    if (line.length > 0) {
      deliver(line)
    }
    // Disconnect after this turn so a trailing frame can finish handshake.
    queueMicrotask(() => {
      close()
    })
  }

  const onInputError = (error: Error): void => {
    close(error)
  }

  const onOutputError = (error: Error): void => {
    close(error)
  }

  const onInputClose = (): void => {
    queueMicrotask(() => {
      close()
    })
  }

  input.on('data', onData)
  input.on('end', onEnd)
  input.on('error', onInputError)
  input.on('close', onInputClose)
  output.on('error', onOutputError)

  return {
    send(text) {
      if (closed) {
        return
      }
      try {
        output.write(`${text}\n`)
      } catch (error) {
        close(error)
        throw error
      }
    },
    onMessage(handler) {
      messageHandlers.add(handler)
      return () => {
        messageHandlers.delete(handler)
      }
    },
    onClose(handler) {
      closeHandlers.add(handler)
      if (closed) {
        queueMicrotask(() => {
          handler()
        })
      }
      return () => {
        closeHandlers.delete(handler)
      }
    },
    close,
  }
}

export class StdioHandler<TCtx = unknown> {
  constructor(
    private readonly router: ImplementedRouter,
    private readonly options?: HandlerOptions,
  ) {}

  bind(
    streams: { input: Readable; output: Writable },
    opts: {
      context:
        | TCtx
        | ((info: {
            input: Readable
            output: Writable
            meta?: unknown
          }) => TCtx | Promise<TCtx>)
    },
  ): { close(): void } {
    const duplexOpts: { maxFrameBytes?: number } = {}
    if (this.options?.maxFrameBytes !== undefined) {
      duplexOpts.maxFrameBytes = this.options.maxFrameBytes
    }
    const duplex = createStdioDuplex(streams, duplexOpts)
    const context =
      typeof opts.context === 'function'
        ? (info: { meta?: unknown }) => {
            const factory = opts.context as (info: {
              input: Readable
              output: Writable
              meta?: unknown
            }) => TCtx | Promise<TCtx>
            return info.meta !== undefined
              ? factory({
                  input: streams.input,
                  output: streams.output,
                  meta: info.meta,
                })
              : factory({ input: streams.input, output: streams.output })
          }
        : opts.context

    const attached = attachRouter({
      duplex,
      router: this.router,
      context,
      ...(this.options?.maxFrameBytes !== undefined
        ? { maxFrameBytes: this.options.maxFrameBytes }
        : {}),
      ...(this.options?.helloTimeoutMs !== undefined
        ? { helloTimeoutMs: this.options.helloTimeoutMs }
        : {}),
      ...(this.options?.onError !== undefined
        ? { onError: this.options.onError }
        : {}),
    })

    let closed = false
    return {
      close() {
        if (closed) {
          return
        }
        closed = true
        attached.close()
      },
    }
  }
}
