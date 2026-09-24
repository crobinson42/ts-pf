import type { IdGenerator } from '@ts-pf/example-clean-arch-app'

export class RandomIds implements IdGenerator {
  next(): string {
    return crypto.randomUUID()
  }
}
