import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web'
import { fileURLToPath } from 'node:url'
import type { FetchHandler } from '@ts-pf/server'

export function examplePort(fallback: number): number {
  const raw = process.env.PORT
  if (raw === undefined || raw === '') {
    return fallback
  }
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function isEntrypoint(metaUrl: string): boolean {
  const entry = process.argv[1]
  if (!entry) {
    return false
  }
  return fileURLToPath(metaUrl) === resolve(entry)
}

export async function listen<TCtx>(
  handler: FetchHandler<TCtx>,
  opts: {
    port: number
    prefix: string
    context: TCtx | ((req: Request) => TCtx | Promise<TCtx>)
  },
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    void handle(handler, opts, req, res)
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      reject(error)
    }
    server.once('error', onError)
    server.listen(opts.port, '127.0.0.1', () => {
      server.off('error', onError)
      resolve()
    })
  })

  return {
    url: `http://127.0.0.1:${opts.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
  }
}

async function handle<TCtx>(
  handler: FetchHandler<TCtx>,
  opts: {
    prefix: string
    context: TCtx | ((req: Request) => TCtx | Promise<TCtx>)
  },
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const request = toRequest(req)
    const result = await handler.handle(request, {
      prefix: opts.prefix,
      context: opts.context,
    })
    const response = result.matched
      ? result.response
      : new Response('Not Found', { status: 404 })
    await writeResponse(res, response)
  } catch (error) {
    if (!res.headersSent) {
      res.statusCode = 500
      res.end('Internal Server Error')
      return
    }
    res.destroy(error instanceof Error ? error : undefined)
  }
}

function toRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? '127.0.0.1'
  const url = `http://${host}${req.url ?? '/'}`
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item)
      }
    } else {
      headers.set(key, value)
    }
  }

  const method = req.method ?? 'GET'
  const ac = new AbortController()
  req.on('aborted', () => {
    ac.abort()
  })

  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    signal: ac.signal,
  }

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>
    init.duplex = 'half'
  }

  return new Request(url, init)
}

async function writeResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  response.headers.forEach((value, key) => {
    if (key === 'set-cookie') {
      return
    }
    const existing = headers[key]
    if (existing === undefined) {
      headers[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      headers[key] = [existing, value]
    }
  })
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) {
    headers['set-cookie'] = cookies
  }

  res.writeHead(response.status, headers)

  if (!response.body) {
    res.end()
    return
  }

  const nodeStream = Readable.fromWeb(
    response.body as NodeWebReadableStream<Uint8Array>,
  )
  nodeStream.pipe(res)
  try {
    await finished(res)
  } catch {
    nodeStream.destroy()
  }
}
