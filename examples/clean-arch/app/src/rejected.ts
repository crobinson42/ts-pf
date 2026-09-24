import type { z } from 'zod'

export type SchemaIssue = z.ZodError['issues'][number]

export class UseCaseRejected {
  readonly name = 'UseCaseRejected'
  constructor(
    readonly code: string,
    readonly data?: unknown,
  ) {}
}

export function rejected(code: string, data?: unknown): never {
  throw new UseCaseRejected(code, data)
}

export function isRejected(error: unknown): error is UseCaseRejected {
  return error instanceof UseCaseRejected
}

export class InvalidInput extends Error {
  readonly name = 'InvalidInput'
  constructor(readonly issues: readonly SchemaIssue[]) {
    super('Invalid input')
  }
}

export class InvalidOutput extends Error {
  readonly name = 'InvalidOutput'
  constructor(readonly issues: readonly SchemaIssue[]) {
    super('Invalid output')
  }
}

export type Outcome<T, E> = [E] extends [never]
  ? { ok: true; data: T }
  : { ok: true; data: T } | { ok: false; error: E }

export type FailMap<E> = {
  [K in E extends { code: infer C extends string } ? C : never]: Extract<
    E,
    { code: K }
  > extends { data: infer D }
    ? (data: D) => never
    : () => never
}

export function settle<T, E extends { code: string }>(
  result: Outcome<T, E>,
  map: FailMap<Exclude<E, { code: 'INVALID' }>>,
): T {
  if (result.ok) {
    return result.data
  }
  const error = result.error as {
    code: string
    issues?: readonly SchemaIssue[]
    data?: unknown
  }
  if (error.code === 'INVALID') {
    throw new InvalidInput(error.issues ?? [])
  }
  const handlers = map as Record<string, (data?: unknown) => never>
  const handle = handlers[error.code]
  if (!handle) {
    throw new Error(`No settle branch for ${error.code}`)
  }
  if ('data' in result.error) {
    return handle(error.data)
  }
  return handle()
}
