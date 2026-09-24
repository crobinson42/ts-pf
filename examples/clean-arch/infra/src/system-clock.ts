import type { Clock } from '@ts-pf/example-clean-arch-app'

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString()
  }
}
