import type { Duplex } from './duplex.js'
import { errorFromEnvelope, localFailure } from './error.js'
import {
  decodeFrame,
  encodeFrame,
  type HelloFrame,
  type MessageFrame,
} from './frame.js'

/**
 * `drained` is present only when the duplex is above its write high-water
 * mark: a sender with more frames for the same id awaits it before the next
 * one. It always resolves (on drain or on session close), never rejects.
 */
export type SendResult =
  | { ok: true; drained?: Promise<void> }
  | { ok: false; reason: 'oversize' | 'stringify' | 'closed' }

type SessionState = 'waiting-hello' | 'ready' | 'closed'

const encoder = new TextEncoder()

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isThenable(value: unknown): value is PromiseLike<void> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

function noopHello(): void {}

export function frameByteLength(frameOrText: MessageFrame | string): number {
  const text =
    typeof frameOrText === 'string' ? frameOrText : encodeFrame(frameOrText)
  return encoder.encode(text).byteLength
}

export class MessageSession {
  readonly ready: Promise<void>

  private state: SessionState = 'waiting-hello'
  private readySettled = false
  private helloInFlight = false
  private helloGeneration = 0
  private closeNotified = false
  private timeoutId: ReturnType<typeof setTimeout> | undefined
  private resolveReady!: () => void
  private rejectReady!: (reason: unknown) => void
  /** Resolvers of drain promises still pending; `enterClosed` flushes them so none outlives the session. */
  private readonly pendingDrains = new Set<() => void>()

  private readonly duplex: Duplex
  private readonly role: 'client' | 'server'
  private readonly maxFrameBytes: number | undefined
  private readonly onHello: (meta?: unknown) => void | Promise<void>
  private readonly onFrame: (frame: MessageFrame, size: number) => void
  private readonly onInvalidFrame:
    | ((info: { id: string; message: string }) => void)
    | undefined
  private readonly onClose: ((reason?: unknown) => void) | undefined
  private readonly unsubMessage: () => void
  private readonly unsubClose: () => void

  constructor(opts: {
    duplex: Duplex
    role: 'client' | 'server'
    maxFrameBytes?: number
    helloTimeoutMs?: number
    helloMeta?: unknown
    onHello?: (meta?: unknown) => void | Promise<void>
    /** `size` is the frame's text length — the receive-side `highWaterMark` unit. */
    onFrame: (frame: MessageFrame, size: number) => void
    onInvalidFrame?: (info: { id: string; message: string }) => void
    onClose?: (reason?: unknown) => void
  }) {
    this.duplex = opts.duplex
    this.role = opts.role
    this.maxFrameBytes = opts.maxFrameBytes
    this.onHello =
      opts.role === 'server' ? (opts.onHello ?? noopHello) : noopHello
    this.onFrame = opts.onFrame
    this.onInvalidFrame = opts.onInvalidFrame
    this.onClose = opts.onClose
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })

    this.unsubMessage = opts.duplex.onMessage((text) => {
      this.onInbound(text)
    })
    this.unsubClose = opts.duplex.onClose((reason) => {
      this.onDuplexClose(reason)
    })

    const helloTimeoutMs = opts.helloTimeoutMs ?? 10_000
    if (helloTimeoutMs > 0) {
      this.timeoutId = setTimeout(() => {
        this.onHelloTimeout()
      }, helloTimeoutMs)
    }

    if (opts.role === 'client') {
      this.sendClientHello(opts.helloMeta)
    }
  }

  send(frame: MessageFrame): SendResult {
    if (this.state === 'closed') {
      return { ok: false, reason: 'closed' }
    }
    let text: string
    try {
      text = encodeFrame(frame)
    } catch {
      return { ok: false, reason: 'stringify' }
    }
    return this.sendText(text)
  }

  sendText(text: string): SendResult {
    if (this.state === 'closed') {
      return { ok: false, reason: 'closed' }
    }
    if (
      this.maxFrameBytes !== undefined &&
      frameByteLength(text) > this.maxFrameBytes
    ) {
      return { ok: false, reason: 'oversize' }
    }
    try {
      const drain = this.duplex.send(text)
      if (isThenable(drain)) {
        return { ok: true, drained: this.untilDrainedOrClosed(drain) }
      }
      return { ok: true }
    } catch (error) {
      this.close(error)
      return { ok: false, reason: 'closed' }
    }
  }

  /**
   * The duplex's drain promise, resolved early on close; a rejection is a
   * transport failure and closes. The resolver lives in `pendingDrains` only
   * until it settles, so a long stream of drained sends retains nothing.
   */
  private untilDrainedOrClosed(drain: PromiseLike<void>): Promise<void> {
    return new Promise<void>((resolve) => {
      const settle = (): void => {
        this.pendingDrains.delete(settle)
        resolve()
      }
      this.pendingDrains.add(settle)
      drain.then(settle, (error: unknown) => {
        this.close(error)
        settle()
      })
    })
  }

  /** Drain promises not yet settled (test hook). @internal */
  get pendingDrainCount(): number {
    return this.pendingDrains.size
  }

  close(reason?: unknown): void {
    if (this.state === 'closed') {
      return
    }
    this.enterClosed()
    if (!this.readySettled) {
      this.failReady(
        reason === undefined
          ? localFailure('Connection closed')
          : localFailure('Connection closed', reason),
      )
    }
    try {
      if (reason === undefined) {
        this.duplex.close()
      } else {
        this.duplex.close(reason)
      }
    } catch {
      // already disconnecting
    }
    this.notifyOnClose(reason)
  }

  private sendClientHello(helloMeta: unknown): void {
    const hello: HelloFrame = { type: 'hello', v: 1 }
    if (helloMeta !== undefined) {
      hello.meta = helloMeta
    }
    const sent = this.send(hello)
    if (!sent.ok) {
      this.failReady(localFailure('Network error'))
      this.close()
    }
  }

  private onHelloTimeout(): void {
    if (this.state !== 'waiting-hello') {
      return
    }
    this.failReady(localFailure('Network error'))
    this.close()
  }

  private onInbound(text: string): void {
    if (this.state === 'closed') {
      return
    }
    if (
      this.maxFrameBytes !== undefined &&
      frameByteLength(text) > this.maxFrameBytes
    ) {
      if (!this.readySettled) {
        this.failReady(localFailure('Network error'))
      }
      this.close()
      return
    }
    if (this.state === 'waiting-hello') {
      void this.handleHandshake(text)
      return
    }
    this.handleReadyMessage(text)
  }

  private async handleHandshake(text: string): Promise<void> {
    if (this.state !== 'waiting-hello') {
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch (cause) {
      if (this.role === 'client' && !this.readySettled) {
        this.failReady(localFailure('Network error', cause))
      }
      this.close()
      return
    }
    if (!isJsonObject(parsed)) {
      if (this.role === 'client' && !this.readySettled) {
        this.failReady(localFailure('Invalid response'))
      }
      this.close()
      return
    }

    if (this.role === 'client') {
      this.handleClientHandshake(text)
      return
    }
    await this.handleServerHandshake(text, parsed)
  }

  private handleClientHandshake(text: string): void {
    const decoded = decodeFrame(text)
    if (
      decoded.ok &&
      decoded.frame.type === 'hello-ok' &&
      decoded.frame.v === 1
    ) {
      this.clearHelloTimeout()
      this.state = 'ready'
      this.succeedReady()
      return
    }
    if (decoded.ok && decoded.frame.type === 'hello-error') {
      this.failReady(errorFromEnvelope(decoded.frame.error))
      this.close()
      return
    }
    this.failReady(localFailure('Invalid response'))
    this.close()
  }

  private async handleServerHandshake(
    text: string,
    parsed: Record<string, unknown>,
  ): Promise<void> {
    const decoded = decodeFrame(text)
    if (
      decoded.ok &&
      decoded.frame.type === 'hello' &&
      decoded.frame.v === 1 &&
      !this.helloInFlight
    ) {
      await this.acceptHello(decoded.frame)
      return
    }
    if (
      parsed.type === 'hello' &&
      typeof parsed.v === 'number' &&
      parsed.v !== 1
    ) {
      this.failHandshake('BAD_REQUEST', 'Unsupported protocol version')
      return
    }
    const message = parsed.type === 'hello' ? 'Invalid hello' : 'Expected hello'
    this.failHandshake('BAD_REQUEST', message)
  }

  private async acceptHello(frame: HelloFrame): Promise<void> {
    this.helloInFlight = true
    const generation = this.helloGeneration
    try {
      if ('meta' in frame) {
        await this.onHello(frame.meta)
      } else {
        await this.onHello()
      }
    } catch {
      if (this.state === 'closed' || generation !== this.helloGeneration) {
        return
      }
      this.failHandshake('INTERNAL', 'Internal server error')
      return
    }
    if (this.state === 'closed' || generation !== this.helloGeneration) {
      return
    }
    const sent = this.send({ type: 'hello-ok', v: 1 })
    if (!sent.ok) {
      this.failReady(localFailure('Network error'))
      this.close()
      return
    }
    this.clearHelloTimeout()
    this.state = 'ready'
    this.helloInFlight = false
    this.succeedReady()
  }

  private handleReadyMessage(text: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      this.close()
      return
    }
    if (!isJsonObject(parsed)) {
      this.close()
      return
    }
    const decoded = decodeFrame(text)
    if (!decoded.ok) {
      if (decoded.id === undefined) {
        this.close()
        return
      }
      this.onInvalidFrame?.({ id: decoded.id, message: decoded.message })
      return
    }
    this.onFrame(decoded.frame, text.length)
  }

  private failHandshake(code: string, message: string): void {
    if (this.state === 'closed') {
      return
    }
    this.failReady(errorFromEnvelope({ code, message }))
    this.send({
      type: 'hello-error',
      error: { code, message },
    })
    this.close()
  }

  private onDuplexClose(reason?: unknown): void {
    if (this.state === 'closed') {
      this.notifyOnClose(reason)
      return
    }
    this.enterClosed()
    if (!this.readySettled) {
      this.failReady(
        reason === undefined
          ? localFailure('Connection closed')
          : localFailure('Connection closed', reason),
      )
    }
    this.notifyOnClose(reason)
  }

  private enterClosed(): void {
    this.state = 'closed'
    this.helloGeneration += 1
    this.clearHelloTimeout()
    this.unsubMessage()
    this.unsubClose()
    for (const settle of [...this.pendingDrains]) {
      settle()
    }
  }

  private succeedReady(): void {
    if (this.readySettled) {
      return
    }
    this.readySettled = true
    this.resolveReady()
  }

  private failReady(error: unknown): void {
    if (this.readySettled) {
      return
    }
    this.readySettled = true
    this.rejectReady(error)
  }

  private clearHelloTimeout(): void {
    if (this.timeoutId === undefined) {
      return
    }
    clearTimeout(this.timeoutId)
    this.timeoutId = undefined
  }

  private notifyOnClose(reason?: unknown): void {
    if (this.closeNotified) {
      return
    }
    this.closeNotified = true
    if (this.onClose === undefined) {
      return
    }
    if (reason === undefined) {
      this.onClose()
    } else {
      this.onClose(reason)
    }
  }
}
