import type { ContractBuilder } from './builder.js'
import type { ErrorMap, InferErrorData } from './errors.js'
import type { ContractProcedure } from './procedure.js'
import type { ValidationIssue } from './schema-types.js'

type InferProc<T> =
  T extends ContractBuilder<infer I, infer O, infer E, infer M>
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
  | 'PAYLOAD_TOO_LARGE'

type DeclaredClientError<E extends ErrorMap> = {
  [K in keyof E & string]: [InferErrorData<E[K]>] extends [never]
    ? { code: K; status: number; message: string; data?: undefined }
    : {
        code: K
        status: number
        message: string
        data: InferErrorData<E[K]>
      }
}[keyof E & string]

type ProtocolErrorByCode<C extends ProtocolErrorCode> = C extends 'VALIDATION'
  ? {
      code: 'VALIDATION'
      status: number
      message: string
      data: { issues: ValidationIssue[] }
    }
  : { code: C; status: number; message: string; data?: unknown }

type ProtocolClientError = ProtocolErrorByCode<ProtocolErrorCode>

export type ClientError<E extends ErrorMap> =
  | ([keyof E] extends [never] ? never : DeclaredClientError<E>)
  | Exclude<ProtocolClientError, { code: keyof E & string }>

export type InferContractErrors<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: InferProc<T[K]> extends never
    ? InferContractErrors<T[K]>
    : ClientError<InferProc<T[K]>['errors']>
}

export interface ContractResultPromise<T, E> extends Promise<T> {
  readonly '~pfError'?: E
}

export type CallOptions = { signal?: AbortSignal }

export type ProcedureClient<I, O, E extends ErrorMap> = I extends void
  ? (opts?: CallOptions) => ContractResultPromise<O, ClientError<E>>
  : (input: I, opts?: CallOptions) => ContractResultPromise<O, ClientError<E>>

export type ContractClient<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: InferProc<T[K]> extends never
    ? ContractClient<T[K]>
    : ProcedureClient<
        InferProc<T[K]>['input'],
        InferProc<T[K]>['output'],
        InferProc<T[K]>['errors']
      >
}
