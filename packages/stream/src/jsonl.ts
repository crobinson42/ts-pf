import { PFError } from '@ts-pf/protocol'

export const JSONL_CONTENT_TYPE = 'application/jsonl'

export async function* readJsonlLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        const last = buffer.trim()
        if (last.length > 0) {
          yield last
        }
        return
      }
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line.length > 0) {
          yield line
        }
        newline = buffer.indexOf('\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function encodeJsonl(
  items: AsyncIterable<unknown>,
  writeLine: (item: unknown) => string | Promise<string>,
  onError: (error: unknown) => string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const iterator = items[Symbol.asyncIterator]()
  let returned = false
  // The producer is still live (consumer cancel, or an item that could not
  // be written): close it once.
  const stopProducer = (): void => {
    if (!returned) {
      returned = true
      returnQuietly(iterator)
    }
  }
  const fail = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    error: unknown,
  ): void => {
    controller.enqueue(encoder.encode(`${onError(error)}\n`))
    controller.close()
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let next: IteratorResult<unknown>
      try {
        next = await iterator.next()
      } catch (error) {
        fail(controller, error)
        return
      }
      if (next.done) {
        controller.close()
        return
      }
      try {
        const line = await writeLine(next.value)
        controller.enqueue(encoder.encode(`${line}\n`))
      } catch (error) {
        stopProducer()
        fail(controller, error)
      }
    },
    cancel() {
      stopProducer()
    },
  })
}

/**
 * `iterator.return()` as cleanup: a sync throw or a rejection is dropped, not
 * left as an unhandled rejection. The stream has already ended for the reader.
 */
function returnQuietly(iterator: AsyncIterator<unknown>): void {
  try {
    Promise.resolve(iterator.return?.()).catch(() => {})
  } catch {
    // Cleanup only.
  }
}

export function badRequest(message: string): PFError {
  return new PFError({ code: 'BAD_REQUEST', status: 400, message })
}
