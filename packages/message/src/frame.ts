export type WireError = { code: string; message: string; data?: unknown }

export type HelloFrame = { type: 'hello'; v: 1; meta?: unknown }
export type HelloOkFrame = { type: 'hello-ok'; v: 1 }
export type HelloErrorFrame = { type: 'hello-error'; error: WireError }

export type CallFrame = {
  type: 'call'
  id: string
  path: string[]
  input?: unknown
  stream?: true
}

export type ResultOkFrame = {
  type: 'result'
  id: string
  ok: true
  output?: unknown
}
export type ResultErrFrame = {
  type: 'result'
  id: string
  ok: false
  error: WireError
}
export type ResultFrame = ResultOkFrame | ResultErrFrame

export type CancelFrame = { type: 'cancel'; id: string }
export type ItemFrame = { type: 'item'; id: string; output?: unknown }
export type DoneFrame = { type: 'done'; id: string }
export type InItemFrame = { type: 'in-item'; id: string; input?: unknown }
export type InDoneFrame = { type: 'in-done'; id: string }

export type MessageFrame =
  | HelloFrame
  | HelloOkFrame
  | HelloErrorFrame
  | CallFrame
  | ResultFrame
  | CancelFrame
  | ItemFrame
  | DoneFrame
  | InItemFrame
  | InDoneFrame

export type DecodeResult =
  | { ok: true; frame: MessageFrame }
  | { ok: false; id?: string; message: string }

const KEYS = {
  hello: ['type', 'v', 'meta'],
  'hello-ok': ['type', 'v'],
  'hello-error': ['type', 'error'],
  call: ['type', 'id', 'path', 'input', 'stream'],
  result: ['type', 'id', 'ok', 'output', 'error'],
  cancel: ['type', 'id'],
  item: ['type', 'id', 'output'],
  done: ['type', 'id'],
  'in-item': ['type', 'id', 'input'],
  'in-done': ['type', 'id'],
} as const

const ERROR_KEYS = new Set(['code', 'message', 'data'])

type FrameType = keyof typeof KEYS

type Fail = (message: string) => DecodeResult

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isPath(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isFrameType(value: unknown): value is FrameType {
  return typeof value === 'string' && Object.hasOwn(KEYS, value)
}

function wireError(error: WireError): WireError {
  const out: WireError = { code: error.code, message: error.message }
  if (error.data !== undefined) {
    out.data = error.data
  }
  return out
}

function decodeWireError(value: unknown): WireError | undefined {
  if (!isJsonObject(value)) {
    return undefined
  }
  for (const key of Object.keys(value)) {
    if (!ERROR_KEYS.has(key)) {
      return undefined
    }
  }
  if (typeof value.code !== 'string' || value.code.length === 0) {
    return undefined
  }
  if (typeof value.message !== 'string') {
    return undefined
  }
  const error: WireError = { code: value.code, message: value.message }
  if ('data' in value) {
    error.data = value.data
  }
  return error
}

export function encodeFrame(frame: MessageFrame): string {
  const body: Record<string, unknown> = { type: frame.type }
  switch (frame.type) {
    case 'hello':
      body.v = 1
      if (frame.meta !== undefined) {
        body.meta = frame.meta
      }
      break
    case 'hello-ok':
      body.v = 1
      break
    case 'hello-error':
      body.error = wireError(frame.error)
      break
    case 'call':
      body.id = frame.id
      body.path = frame.path
      if (frame.input !== undefined) {
        body.input = frame.input
      }
      if (frame.stream === true) {
        body.stream = true
      }
      break
    case 'result':
      body.id = frame.id
      body.ok = frame.ok
      if (frame.ok) {
        if (frame.output !== undefined) {
          body.output = frame.output
        }
      } else {
        body.error = wireError(frame.error)
      }
      break
    case 'item':
      body.id = frame.id
      if (frame.output !== undefined) {
        body.output = frame.output
      }
      break
    case 'in-item':
      body.id = frame.id
      if (frame.input !== undefined) {
        body.input = frame.input
      }
      break
    case 'cancel':
    case 'done':
    case 'in-done':
      body.id = frame.id
      break
  }
  return JSON.stringify(body)
}

export function decodeFrame(text: string): DecodeResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return { ok: false, message: 'Invalid JSON' }
  }
  if (!isJsonObject(parsed)) {
    return { ok: false, message: 'Frame must be a JSON object' }
  }

  const id = isId(parsed.id) ? parsed.id : undefined
  const fail: Fail = (message) =>
    id === undefined ? { ok: false, message } : { ok: false, id, message }

  if (!isFrameType(parsed.type)) {
    return fail('Unknown or missing type')
  }

  const allowed = new Set<string>(KEYS[parsed.type])
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) {
      return fail(`Unexpected key ${key}`)
    }
  }

  return validateKnown(parsed.type, parsed, fail)
}

function validateKnown(
  type: FrameType,
  obj: Record<string, unknown>,
  fail: Fail,
): DecodeResult {
  switch (type) {
    case 'hello': {
      if (obj.v !== 1) {
        return fail('Invalid v')
      }
      const frame: HelloFrame = { type: 'hello', v: 1 }
      if ('meta' in obj) {
        frame.meta = obj.meta
      }
      return { ok: true, frame }
    }
    case 'hello-ok':
      if (obj.v !== 1) {
        return fail('Invalid v')
      }
      return { ok: true, frame: { type: 'hello-ok', v: 1 } }
    case 'hello-error': {
      const error = decodeWireError(obj.error)
      if (error === undefined) {
        return fail('Invalid error')
      }
      return { ok: true, frame: { type: 'hello-error', error } }
    }
    case 'call': {
      if (!isId(obj.id)) {
        return fail('Invalid id')
      }
      if (!isPath(obj.path)) {
        return fail('Invalid path')
      }
      if ('stream' in obj && obj.stream !== true) {
        return fail('Invalid stream')
      }
      if (obj.stream === true && 'input' in obj) {
        return fail('stream cannot be set with input')
      }
      const frame: CallFrame = { type: 'call', id: obj.id, path: obj.path }
      if (obj.stream === true) {
        frame.stream = true
      } else if ('input' in obj && obj.input !== null) {
        frame.input = obj.input
      }
      return { ok: true, frame }
    }
    case 'result': {
      if (!isId(obj.id)) {
        return fail('Invalid id')
      }
      if (typeof obj.ok !== 'boolean') {
        return fail('Invalid ok')
      }
      if (obj.ok) {
        if ('error' in obj) {
          return fail('error is not allowed when ok is true')
        }
        const frame: ResultOkFrame = { type: 'result', id: obj.id, ok: true }
        if ('output' in obj) {
          frame.output = obj.output
        }
        return { ok: true, frame }
      }
      if ('output' in obj) {
        return fail('output is not allowed when ok is false')
      }
      const error = decodeWireError(obj.error)
      if (error === undefined) {
        return fail('Invalid error')
      }
      return {
        ok: true,
        frame: { type: 'result', id: obj.id, ok: false, error },
      }
    }
    case 'item': {
      if (!isId(obj.id)) {
        return fail('Invalid id')
      }
      const frame: ItemFrame = { type: 'item', id: obj.id }
      if ('output' in obj) {
        frame.output = obj.output
      }
      return { ok: true, frame }
    }
    case 'in-item': {
      if (!isId(obj.id)) {
        return fail('Invalid id')
      }
      const frame: InItemFrame = { type: 'in-item', id: obj.id }
      if ('input' in obj) {
        frame.input = obj.input
      }
      return { ok: true, frame }
    }
    case 'cancel':
    case 'done':
    case 'in-done':
      if (!isId(obj.id)) {
        return fail('Invalid id')
      }
      return { ok: true, frame: { type, id: obj.id } }
  }
}
