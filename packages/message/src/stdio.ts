import type { Readable, Writable } from 'node:stream'
import type { Duplex } from './duplex.js'

function asBuffer(chunk: unknown): Buffer {
  if (typeof chunk === 'string') {
    return Buffer.from(chunk, 'utf8')
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk)
  }
  return Buffer.from(String(chunk), 'utf8')
}

export function createStdioDuplex(
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
    // Disconnect after this turn so a trailing frame can settle.
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
