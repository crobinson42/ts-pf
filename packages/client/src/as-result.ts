import { isPFError, type PFError } from '@ts-pf/protocol'

export type CallResult<T, E> =
  | { ok: true; data: T; error?: undefined }
  | { ok: false; data?: undefined; error: E }

export async function asResult<T, E = PFError>(
  promise: Promise<T> & { readonly '~pfError'?: E },
): Promise<CallResult<T, E | PFError>> {
  try {
    return { ok: true, data: await promise }
  } catch (error) {
    if (isPFError(error)) {
      return { ok: false, error: error as E }
    }
    throw error
  }
}
