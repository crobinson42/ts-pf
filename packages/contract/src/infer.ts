import type { ContractBuilder } from './builder.js'
import type { ErrorMap } from './errors.js'
import type { ContractProcedure } from './procedure.js'

type InferProc<T> = T extends ContractBuilder<infer I, infer O, infer E, infer M>
  ? { input: I; output: O; errors: E; meta: M }
  : T extends ContractProcedure<infer I, infer O, infer E, infer M>
    ? { input: I; output: O; errors: E; meta: M }
    : never

export type InferContractInputs<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: InferProc<T[K]> extends never
    ? InferContractInputs<T[K]>
    : InferProc<T[K]>['input']
}

export type InferContractOutputs<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: InferProc<T[K]> extends never
    ? InferContractOutputs<T[K]>
    : InferProc<T[K]>['output']
}

export type InferContractErrorCodes<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: InferProc<T[K]> extends never
    ? InferContractErrorCodes<T[K]>
    : keyof InferProc<T[K]>['errors']
}

type ProtocolErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'INTERNAL'
  | 'METHOD_NOT_ALLOWED'

export type ClientError<E extends ErrorMap> =
  | {
      code: (keyof E & string) | ProtocolErrorCode
      status: number
      message: string
      data?: unknown
    }

export interface ContractResultPromise<T, E> extends Promise<T> {
  readonly '~pfError'?: E
}

export type ProcedureClient<I, O, E extends ErrorMap> = I extends void
  ? () => ContractResultPromise<O, ClientError<E>>
  : (input: I) => ContractResultPromise<O, ClientError<E>>

export type ContractClient<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: InferProc<T[K]> extends never
    ? ContractClient<T[K]>
    : ProcedureClient<InferProc<T[K]>['input'], InferProc<T[K]>['output'], InferProc<T[K]>['errors']>
}
