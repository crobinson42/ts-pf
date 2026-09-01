export const SSE_CONTENT_TYPE = 'text/event-stream'

export type SseEvent = {
  event: string
  data: string
}

const COMMENT = ':\n\n'
const CLOSE_EVENT = 'event: close\n\n'

function encodeEvent(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`
}

function splitLines(buffer: string): { lines: string[]; rest: string } {
  const lines: string[] = []
  let i = 0
  while (i < buffer.length) {
    const cr = buffer.indexOf('\r', i)
    const lf = buffer.indexOf('\n', i)
    if (cr === -1 && lf === -1) {
      break
    }
    if (lf !== -1 && (cr === -1 || lf < cr)) {
      lines.push(buffer.slice(i, lf))
      i = lf + 1
      continue
    }
    if (cr === buffer.length - 1) {
      break
    }
    lines.push(buffer.slice(i, cr))
    i = buffer[cr + 1] === '\n' ? cr + 2 : cr + 1
  }
  return { lines, rest: buffer.slice(i) }
}

export async function* readSseEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataBuf = ''
  let eventType = ''
  let sawBom = false

  const dispatch = (): SseEvent | null => {
    const type = eventType === '' ? 'message' : eventType
    let data = dataBuf
    if (data.endsWith('\n')) {
      data = data.slice(0, -1)
    }
    dataBuf = ''
    eventType = ''
    if (type === 'close') {
      return { event: 'close', data }
    }
    if (data === '') {
      return null
    }
    return { event: type, data }
  }

  const processLine = (line: string): SseEvent | null => {
    if (line === '') {
      return dispatch()
    }
    if (line.startsWith(':')) {
      return null
    }
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) {
      value = value.slice(1)
    }
    if (field === 'event') {
      eventType = value
    } else if (field === 'data') {
      dataBuf += `${value}\n`
    }
    return null
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        return
      }
      let chunk = decoder.decode(value, { stream: true })
      if (!sawBom) {
        sawBom = true
        if (chunk.charCodeAt(0) === 0xfeff) {
          chunk = chunk.slice(1)
        }
      }
      buffer += chunk
      const split = splitLines(buffer)
      buffer = split.rest
      for (const line of split.lines) {
        const event = processLine(line)
        if (event) {
          yield event
        }
      }
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      reader.releaseLock()
    }
  }
}

export function encodeSse(
  items: AsyncIterable<unknown>,
  writeLine: (item: unknown) => string | Promise<string>,
  onError: (error: unknown) => string,
  keepAliveMs: number,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const iterator = items[Symbol.asyncIterator]()
  let timer: ReturnType<typeof setInterval> | undefined
  let closed = false

  const comment = encoder.encode(COMMENT)

  const stop = (): void => {
    closed = true
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(comment)
      if (keepAliveMs > 0) {
        timer = setInterval(() => {
          if (closed) {
            return
          }
          try {
            controller.enqueue(comment)
          } catch {
            stop()
          }
        }, keepAliveMs)
      }
    },
    async pull(controller) {
      try {
        const next = await iterator.next()
        if (next.done) {
          controller.enqueue(encoder.encode(CLOSE_EVENT))
          stop()
          controller.close()
          return
        }
        const line = await writeLine(next.value)
        controller.enqueue(encoder.encode(encodeEvent('message', line)))
      } catch (error) {
        controller.enqueue(encoder.encode(encodeEvent('error', onError(error))))
        stop()
        controller.close()
      }
    },
    cancel() {
      stop()
      void iterator.return?.()
    },
  })
}
