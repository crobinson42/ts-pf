// Replays @ts-pf/protocol's language-neutral ws.json (see
// packages/protocol/conformance/README.md) through WsLink over a scripted
// socket that plays the server: no server, no network.
import { isLocalFailure } from '@ts-pf/client'
import type { WebSocketLike } from '@ts-pf/message-client'
import { WsLink } from '@ts-pf/message-client'
import { isPFError, type PFError } from '@ts-pf/protocol'
import {
  type ConformanceError,
  type JsonValue,
  type WsCase,
  type WsExpectation,
  wsConformance,
} from '@ts-pf/protocol/conformance'
import { describe, expect, it } from 'vitest'

const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3
const STEP_TIMEOUT_MS = 1000

type Listener = (event: { data?: unknown }) => void
type EventName = 'message' | 'open' | 'close' | 'error'
type Frame = { [key: string]: JsonValue }
type Outcome = { ok: true; value: unknown } | { ok: false; error: unknown }

/** An open socket whose peer is the script: it records what the client sends and closes. */
class ScriptSocket implements WebSocketLike {
  readyState = WS_OPEN
  readonly sent: string[] = []
  readonly closeCodes: Array<number | undefined> = []
  private readonly listeners: Record<EventName, Set<Listener>> = {
    message: new Set(),
    open: new Set(),
    close: new Set(),
    error: new Set(),
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(code?: number): void {
    if (this.readyState === WS_CLOSING || this.readyState === WS_CLOSED) {
      return
    }
    this.closeCodes.push(code)
    this.readyState = WS_CLOSING
    queueMicrotask(() => {
      this.readyState = WS_CLOSED
      this.dispatch('close', {})
    })
  }

  addEventListener(type: EventName, handler: Listener): void {
    this.listeners[type].add(handler)
  }

  removeEventListener(type: EventName, handler: Listener): void {
    this.listeners[type].delete(handler)
  }

  /** A server message; dropped once the client has closed, as a real socket would. */
  deliver(data: string | Uint8Array): void {
    if (this.readyState === WS_OPEN) {
      this.dispatch('message', { data })
    }
  }

  /**
   * The server closes the connection. Not recorded in `closeCodes` (those are
   * the client's); WsLink does not surface the code, so it is not passed on.
   */
  serverClose(): void {
    if (this.readyState === WS_OPEN) {
      this.readyState = WS_CLOSED
      this.dispatch('close', {})
    }
  }

  private dispatch(type: EventName, event: { data?: unknown }): void {
    for (const handler of [...this.listeners[type]]) {
      handler(event)
    }
  }
}

/** Let the client finish reacting to what it has been given. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function outcomeOf(promise: Promise<unknown>): Promise<Outcome> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  )
}

async function withinTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out waiting for ${what}`))
    }, STEP_TIMEOUT_MS)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function* valuesOf(items: JsonValue[]): AsyncGenerator<JsonValue> {
  for (const item of items) {
    yield item
  }
}

function failureOf(outcome: Outcome): PFError {
  expect(outcome.ok).toBe(false)
  const error = outcome.ok ? undefined : outcome.error
  expect(isPFError(error)).toBe(true)
  return error as PFError
}

/** A failure envelope from the server (`hello-error` or `result` `ok: false`). */
function expectError(outcome: Outcome, expected: ConformanceError): void {
  const error = failureOf(outcome)
  expect(isLocalFailure(error)).toBe(false)
  expect(error.code).toBe(expected.code)
  expect(error.message).toBe(expected.message)
  expect(error.data).toStrictEqual(expected.data)
}

/** A failure the client raised itself; `reference` is the TypeScript wording. */
function expectLocalFailure(outcome: Outcome, reference?: string): void {
  const error = failureOf(outcome)
  expect(isLocalFailure(error)).toBe(true)
  if (reference !== undefined) {
    expect(error.message).toBe(reference)
  }
}

type CallState = {
  outcome: Promise<Outcome>
  controller: AbortController
  stream?: AsyncIterator<unknown>
}

class ScriptRunner {
  private readonly socket = new ScriptSocket()
  private readonly link: WsLink
  private readonly calls = new Map<string, CallState>()
  /** Fixture call id → the id the client actually sent. */
  private readonly ids = new Map<string, string>()
  private matched = 0

  constructor(private readonly testCase: WsCase) {
    const meta = testCase.options?.meta
    this.link = new WsLink({
      socket: this.socket,
      helloTimeoutMs: 0,
      ...(meta !== undefined ? { meta } : {}),
    })
  }

  async run(): Promise<void> {
    for (const step of this.testCase.steps) {
      if ('send' in step) {
        await this.expectSent(step.send)
      } else if ('receive' in step) {
        await this.expectIdle()
        this.socket.deliver(JSON.stringify(this.withIds(step.receive)))
      } else if ('receiveText' in step) {
        await this.expectIdle()
        this.socket.deliver(step.receiveText)
      } else if ('receiveBinary' in step) {
        await this.expectIdle()
        this.socket.deliver(Buffer.from(step.receiveBinary, 'base64'))
      } else if ('serverClose' in step) {
        await this.expectIdle()
        this.socket.serverClose()
      } else if ('call' in step) {
        const controller = new AbortController()
        const input =
          step.inputStream !== undefined
            ? valuesOf(step.inputStream)
            : step.input
        const call = this.link.call(step.path, input, controller.signal)
        this.calls.set(step.call, { outcome: outcomeOf(call), controller })
      } else if ('abort' in step) {
        const call = this.call(step.abort)
        if (call.stream !== undefined) {
          await call.stream.return?.()
        } else {
          call.controller.abort()
        }
      } else {
        await this.expectIdle()
        await this.check(step.expect)
      }
    }
    await this.expectIdle()
  }

  /** Every frame the client sent so far was matched by a `send` step. */
  private async expectIdle(): Promise<void> {
    await settle()
    expect(this.socket.sent.slice(this.matched), 'unscripted frames').toEqual(
      [],
    )
  }

  private async expectSent(expected: Frame): Promise<void> {
    await settle()
    const text = this.socket.sent[this.matched]
    expect(text, `client to send ${JSON.stringify(expected)}`).toBeDefined()
    this.matched += 1
    const frame = JSON.parse(text as string) as Frame
    this.bindId(expected, frame)
    expect(frame).toStrictEqual(this.withIds(expected))
  }

  /** A `call` frame introduces a fixture id: bind it to the client's own id. */
  private bindId(expected: Frame, actual: Frame): void {
    if (
      expected.type !== 'call' ||
      typeof expected.id !== 'string' ||
      this.ids.has(expected.id)
    ) {
      return
    }
    // Uniqueness among in-flight calls is exercised by the scripts themselves
    // (ws-multiplex): a reused in-flight id would misroute their frames.
    expect(typeof actual.id === 'string' && actual.id !== '').toBe(true)
    this.ids.set(expected.id, actual.id as string)
  }

  private withIds(frame: Frame): Frame {
    const bound = typeof frame.id === 'string' && this.ids.get(frame.id)
    return bound ? { ...frame, id: bound } : frame
  }

  private call(label: string): CallState {
    const call = this.calls.get(label)
    if (call === undefined) {
      throw new Error(`no call "${label}" in this script`)
    }
    return call
  }

  private async check(expected: WsExpectation): Promise<void> {
    if ('closed' in expected) {
      expect(this.socket.closeCodes).toHaveLength(1)
      if (expected.closed.code !== undefined) {
        expect(this.socket.closeCodes[0]).toBe(expected.closed.code)
      }
      return
    }
    if ('handshake' in expected) {
      // WsLink exposes no connect result: a call made now waits on the same
      // handshake and fails with its error (it would send a frame, which the
      // final idle check rejects, had the handshake succeeded).
      const probe = await withinTimeout(
        outcomeOf(this.link.call(['conformance-probe'], undefined)),
        'the handshake',
      )
      if (expected.handshake === 'error') {
        expectError(probe, expected.error)
      } else {
        expectLocalFailure(probe, expected.reference)
      }
      return
    }
    if ('call' in expected) {
      const call = this.call(expected.call)
      const outcome = await withinTimeout(call.outcome, `call ${expected.call}`)
      switch (expected.outcome) {
        case 'value':
          expect(outcome).toStrictEqual({ ok: true, value: expected.output })
          return
        case 'stream': {
          expect(outcome.ok).toBe(true)
          const value = outcome.ok ? outcome.value : undefined
          expect(Symbol.asyncIterator in Object(value)).toBe(true)
          call.stream = (value as AsyncIterable<unknown>)[
            Symbol.asyncIterator
          ]()
          return
        }
        case 'error':
          expectError(outcome, expected.error)
          return
        case 'local-failure':
          expectLocalFailure(outcome, expected.reference)
          return
      }
    }
    const stream = this.call(expected.stream).stream
    if (stream === undefined) {
      throw new Error(`call "${expected.stream}" did not resolve to a stream`)
    }
    const next = await withinTimeout(
      outcomeOf(stream.next()),
      `stream ${expected.stream}`,
    )
    switch (expected.outcome) {
      case 'item':
        expect(next).toStrictEqual({
          ok: true,
          value: { done: false, value: expected.output },
        })
        return
      case 'done':
        expect(next).toStrictEqual({
          ok: true,
          value: { done: true, value: undefined },
        })
        return
      case 'error':
        expectError(next, expected.error)
        return
      case 'local-failure':
        expectLocalFailure(next, expected.reference)
        return
    }
  }
}

describe(`conformance: ws.json (revision ${wsConformance.revision})`, () => {
  for (const testCase of wsConformance.cases) {
    it(`${testCase.id}: ${testCase.description}`, async () => {
      await new ScriptRunner(testCase).run()
    })
  }
})
