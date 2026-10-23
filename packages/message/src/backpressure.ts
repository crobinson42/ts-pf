/**
 * Slow-peer protection shared by `@ts-pf/message-server` and
 * `@ts-pf/message-client`: one option object (`BackpressureOptions`), its
 * validated form (`resolveBackpressure`), and the per-call wait a sender
 * performs while a duplex drains (`DrainWaiter`). No frame changes; see
 * `PROTOCOL.md` "Backpressure".
 */

/** `onStall` payload: the call whose peer is not draining. */
export type StallInfo = {
  path: string[]
  id: string
  /** `0` when `paused`; the time spent waiting when `aborted`. */
  waitedMs: number
  action: 'paused' | 'aborted'
}

export type BackpressureOptions = {
  /**
   * The high-water mark: on the send side, bytes the duplex may buffer
   * (WebSocket `bufferedAmount`, a refused stdio `write()`) before a
   * producer pauses; on the receive side, the per-call queue bound measured
   * in frame text length above which the receiver pauses reading the duplex.
   * Default 1 MiB. `Infinity` disables both.
   */
  highWaterMark?: number
  /**
   * Milliseconds a paused sender waits for the peer to drain before the call
   * is aborted. Default 30_000. `0` disables the timeout (pause forever).
   */
  drainTimeout?: number
  /**
   * Called on the first pause of a call (`action: 'paused'`) and when its
   * drain timeout fires (`action: 'aborted'`). Default: one `console.warn`
   * line for `aborted` only (a pause is normal flow control on a busy link).
   * Pass your own to replace it, or `false` to silence. A throw from it is
   * swallowed: a logging hook never changes the call's outcome.
   */
  onStall?: ((info: StallInfo) => void) | false
}

/**
 * `BackpressureOptions` with defaults applied; `resolveBackpressure` on it is the identity.
 * @internal Shared by `@ts-pf/message-server` / `message-client`; not a consumer API.
 */
export type Backpressure = {
  highWaterMark: number
  drainTimeout: number
  onStall: ((info: StallInfo) => void) | false
}

/** @internal */
export type DrainOutcome = 'drained' | 'timeout' | 'cancelled'

export const DEFAULT_HIGH_WATER_MARK = 1024 * 1024
export const DEFAULT_DRAIN_TIMEOUT = 30_000

function warnStall(info: StallInfo): void {
  if (info.action !== 'aborted') {
    return
  }
  console.warn(
    `[ts-pf] ${info.path.join('.')} (id ${info.id}): peer did not drain within ${info.waitedMs} ms, call aborted`,
  )
}

/**
 * Apply defaults and validate; a bad value is a `TypeError` naming the option.
 * @internal Shared by `@ts-pf/message-server` / `message-client`; not a consumer API.
 */
export function resolveBackpressure(
  options: BackpressureOptions = {},
): Backpressure {
  const highWaterMark = options.highWaterMark ?? DEFAULT_HIGH_WATER_MARK
  if (
    typeof highWaterMark !== 'number' ||
    Number.isNaN(highWaterMark) ||
    highWaterMark < 0
  ) {
    throw new TypeError(
      'backpressure.highWaterMark must be a number >= 0 (Infinity disables it)',
    )
  }
  const drainTimeout = options.drainTimeout ?? DEFAULT_DRAIN_TIMEOUT
  if (!Number.isFinite(drainTimeout) || drainTimeout < 0) {
    throw new TypeError(
      'backpressure.drainTimeout must be a finite number >= 0 (0 disables it)',
    )
  }
  const onStall = options.onStall ?? warnStall
  if (onStall !== false && typeof onStall !== 'function') {
    throw new TypeError('backpressure.onStall must be a function or false')
  }
  return { highWaterMark, drainTimeout, onStall }
}

/**
 * The wait a sender performs between two frames of one call while the duplex
 * drains. `wait(drained)` resolves `'drained'` when the duplex's promise
 * settles, `'timeout'` when `drainTimeout` elapses first (after
 * `onStall('aborted')`), or `'cancelled'` after `cancel()`. The first wait of
 * a call fires `onStall('paused')` once. One wait at a time: a second
 * concurrent `wait` is an invariant violation and throws. `onStall` is
 * invoked after the outcome is decided and its throws are swallowed, so a
 * logging hook can neither hang nor change the call.
 * @internal Shared by `@ts-pf/message-server` / `message-client`; not a consumer API.
 */
export class DrainWaiter {
  private stalled = false
  private pending: ((outcome: DrainOutcome) => void) | undefined

  constructor(
    private readonly backpressure: Backpressure,
    private readonly call: { path: string[]; id: string },
  ) {}

  wait(drained: Promise<void>): Promise<DrainOutcome> {
    if (this.pending !== undefined) {
      throw new Error('DrainWaiter: a wait is already pending for this call')
    }
    const started = Date.now()
    const outcome = new Promise<DrainOutcome>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const settle = (result: DrainOutcome): void => {
        if (this.pending !== settle) {
          return
        }
        this.pending = undefined
        if (timer !== undefined) {
          clearTimeout(timer)
        }
        resolve(result)
        if (result === 'timeout') {
          this.notify('aborted', Date.now() - started)
        }
      }
      this.pending = settle
      if (this.backpressure.drainTimeout > 0) {
        timer = setTimeout(() => {
          settle('timeout')
        }, this.backpressure.drainTimeout)
      }
      drained.then(
        () => {
          settle('drained')
        },
        () => {
          settle('drained')
        },
      )
    })
    if (!this.stalled) {
      this.stalled = true
      this.notify('paused', 0)
    }
    return outcome
  }

  /** Settle a pending wait as `'cancelled'` (cancel frame, abort, close). */
  cancel(): void {
    this.pending?.('cancelled')
  }

  /** A logging hook; a throw from it is swallowed so it cannot alter the call. */
  private notify(action: StallInfo['action'], waitedMs: number): void {
    if (this.backpressure.onStall === false) {
      return
    }
    try {
      this.backpressure.onStall({
        path: this.call.path,
        id: this.call.id,
        waitedMs,
        action,
      })
    } catch {
      // onStall is observability only; the call's outcome is already decided
    }
  }
}
