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
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next()
        if (next.done) {
          controller.close()
          return
        }
        const line = await writeLine(next.value)
        controller.enqueue(encoder.encode(`${line}\n`))
      } catch (error) {
        controller.enqueue(encoder.encode(`${onError(error)}\n`))
        controller.close()
      }
    },
    cancel() {
      void iterator.return?.()
    },
  })
}

export function badRequest(message: string): PFError {
  return new PFError({ code: 'BAD_REQUEST', status: 400, message })
}
