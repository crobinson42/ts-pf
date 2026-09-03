import type { Readable, Writable } from 'node:stream'
import type { Link } from '@ts-pf/client'
import type { Duplex } from '@ts-pf/message'
import { attachClient, type LinkOptions } from './shared.js'

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
    // Disconnect after this turn so a trailing frame can settle inflight calls.
    queueMicrotask(() => {
      close()
    })
  }

  const onInputError = (error: Error): void => {
    close(error)
  }

  const onInputClose = (): void => {
    queueMicrotask(() => {
      close()
    })
  }

  const onOutputError = (error: Error): void => {
    close(error)
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

export class StdioLink implements Link {
  private readonly attached: ReturnType<typeof attachClient>
  private closed = false

  constructor(opts: { input: Readable; output: Writable } & LinkOptions) {
    const duplexOpts: { maxFrameBytes?: number } = {}
    if (opts.maxFrameBytes !== undefined) {
      duplexOpts.maxFrameBytes = opts.maxFrameBytes
    }
    const duplex = createStdioDuplex(
      { input: opts.input, output: opts.output },
      duplexOpts,
    )
    const attach: Parameters<typeof attachClient>[0] = { duplex }
    if (opts.meta !== undefined) {
      attach.meta = opts.meta
    }
    if (opts.maxFrameBytes !== undefined) {
      attach.maxFrameBytes = opts.maxFrameBytes
    }
    if (opts.helloTimeoutMs !== undefined) {
      attach.helloTimeoutMs = opts.helloTimeoutMs
    }
    this.attached = attachClient(attach)
  }

  call(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): ReturnType<Link['call']> {
    return this.attached.call(path, input, signal)
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.attached.close()
  }
}
