import type { PFError, PFResultPromise } from '@ts-pf/protocol'

export interface Link {
  call(
    path: string[],
    input: unknown,
    signal?: AbortSignal,
  ): PFResultPromise<unknown, PFError>
}
