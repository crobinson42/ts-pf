// Example-local Node bridge for `npm run dev`. ts-pf ships no Node adapter
// (.agents/rules.md): this file only exists so the FetchHandler in server.ts
// can listen on plain `node:http`. Bodies are buffered on both sides; request
// and response streaming are not supported here.
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import worker from './server.js'

const port = Number(process.env.PORT ?? 8787)

async function toRequest(req: IncomingMessage): Promise<Request> {
  const method = req.method ?? 'GET'
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) headers.append(name, item)
    }
  }
  const chunks: Uint8Array[] = []
  for await (const chunk of req) chunks.push(chunk as Uint8Array)
  const body =
    method === 'GET' || method === 'HEAD'
      ? null
      : new Uint8Array(Buffer.concat(chunks))
  const host = req.headers.host ?? `127.0.0.1:${port}`
  return new Request(`http://${host}${req.url ?? '/'}`, {
    method,
    headers,
    body,
  })
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    headers[name] = value
  })
  res.writeHead(response.status, headers)
  res.end(new Uint8Array(await response.arrayBuffer()))
}

createServer(async (req, res) => {
  try {
    await send(res, await worker.fetch(await toRequest(req)))
  } catch (error) {
    console.error(error)
    res.writeHead(500).end()
  }
}).listen(port, () => {
  console.log(`hello: POST http://127.0.0.1:${port}/rpc/planet/find`)
})
