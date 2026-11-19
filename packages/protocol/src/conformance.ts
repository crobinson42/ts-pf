// Language-neutral conformance fixtures for PROTOCOL.md (see
// conformance/README.md). The JSON files are the source of truth and ship in
// the package; this module only re-exports them with types, for TypeScript
// runners. Other runtimes read the JSON files directly.
import http from '../conformance/http.json' with { type: 'json' }
import httpStream from '../conformance/http-stream.json' with { type: 'json' }
import ws from '../conformance/ws.json' with { type: 'json' }

/** Any JSON value, as written in a fixture. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

/** One fixture file. `protocol` is the wire major; `revision` the PROTOCOL.md revision it was written against. */
export type ConformanceFile<TCase> = {
  protocol: number
  revision: string
  binding: 'http' | 'http-stream' | 'ws'
  description: string
  cases: TCase[]
}

/** The `error` of a failure envelope. */
export type ConformanceError = {
  code: string
  message: string
  data?: JsonValue
}

/** The request the client must send. `bodyOneOf` lists equally valid bodies (no input: `{}` or `{"input":null}`). */
export type ConformanceRequest = {
  method: 'POST'
  path: string
  headers: Record<string, string>
  body?: JsonValue
  bodyOneOf?: JsonValue[]
}

export type HttpExpect =
  | { kind: 'success'; output?: JsonValue }
  | ({ kind: 'error' } & ConformanceError)
  | { kind: 'transport-failure' }
  | { kind: 'version-mismatch' }

export type HttpStreamEnd =
  | { kind: 'eof' }
  | ({ kind: 'error' } & ConformanceError)
  | { kind: 'transport-failure' }

export type HttpStreamExpect =
  | HttpExpect
  | {
      kind: 'stream'
      items: Array<{ output?: JsonValue }>
      end: HttpStreamEnd
    }

/** One request / response pair of `http.json` (`TExpect = HttpExpect`) or `http-stream.json` (`HttpStreamExpect`). */
export type HttpCase<TExpect = HttpExpect> = {
  id: string
  description: string
  request: { procedure: string[]; input?: JsonValue }
  expectRequest: ConformanceRequest
  response: { status: number; headers: Record<string, string>; body: string }
  expect: TExpect
}

export type WsExpectation =
  | { call: string; outcome: 'value'; output?: JsonValue }
  | { call: string; outcome: 'error'; error: ConformanceError }
  | { call: string; outcome: 'stream' }
  | { call: string; outcome: 'local-failure'; reference?: string }
  | { stream: string; outcome: 'item'; output?: JsonValue }
  | { stream: string; outcome: 'done' }
  | { stream: string; outcome: 'error'; error: ConformanceError }
  | { stream: string; outcome: 'local-failure'; reference?: string }
  | { handshake: 'error'; error: ConformanceError }
  | { handshake: 'local-failure'; reference?: string }
  | { closed: { code?: number } }

export type WsStep =
  | { send: { [key: string]: JsonValue } }
  | { receive: { [key: string]: JsonValue } }
  | { receiveText: string }
  | { receiveBinary: string }
  | { serverClose: { code?: number } }
  | {
      call: string
      path: string[]
      input?: JsonValue
      inputStream?: JsonValue[]
    }
  | { abort: string }
  | { expect: WsExpectation }

/** One frame script of `ws.json`, from the client's side. */
export type WsCase = {
  id: string
  description: string
  options?: { meta?: JsonValue }
  steps: WsStep[]
}

/** `conformance/http.json`: unary JSON over HTTP. */
export const httpConformance = http as ConformanceFile<HttpCase>

/** `conformance/http-stream.json`: `application/jsonl` output streams. */
export const httpStreamConformance = httpStream as ConformanceFile<
  HttpCase<HttpStreamExpect>
>

/** `conformance/ws.json`: WebSocket frame scripts (also stdio / MessagePort, minus binary and close codes). */
export const wsConformance = ws as ConformanceFile<WsCase>
