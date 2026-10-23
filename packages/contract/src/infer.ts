import type { ErrorMap, InferErrorData } from './errors.js'
import type { ContractProcedure } from './procedure.js'
import type { ValidationIssue } from './schema-types.js'

/**
 * The `{ input, output, errors, meta }` of one contract procedure type, or
 * `never` for anything else (a router object, a plain value). Matches a
 * `ContractBuilder` (which implements `ContractProcedure`, phantom `~types`
 * included) and a hand-written `ContractProcedure<I, O, E, M>` (codegen
 * output) alike, so consumers need one branch, not two.
 */
export type InferContractProcedure<T> =
  T extends ContractProcedure<infer I, infer O, infer E, infer M>
    ? { input: I; output: O; errors: E; meta: M }
    : never

/** `true` when `T` is a contract procedure type (builder or hand-written). */
export type IsContractProcedure<T> = [InferContractProcedure<T>] extends [never]
  ? false
  : true

export type InferContractInputs<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: IsContractProcedure<
    T[K]
  > extends false
    ? InferContractInputs<T[K]>
    : InferContractProcedure<T[K]>['input']
}

export type InferContractOutputs<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: IsContractProcedure<
    T[K]
  > extends false
    ? InferContractOutputs<T[K]>
    : InferContractProcedure<T[K]>['output']
}

export type InferContractErrorCodes<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: IsContractProcedure<
    T[K]
  > extends false
    ? InferContractErrorCodes<T[K]>
    : keyof InferContractProcedure<T[K]>['errors']
}

// Hand-written duplicate of ProtocolErrorCode in @ts-pf/protocol. contract
// does not import protocol; a type test in @ts-pf/server keeps them equal.
type ProtocolErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'INTERNAL'
  | 'METHOD_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'

export type ContractProtocolErrorCode = ProtocolErrorCode

type DeclaredClientError<E extends ErrorMap> = {
  [K in keyof E & string]: [InferErrorData<E[K]>] extends [never]
    ? { code: K; status?: number; message: string; data?: undefined }
    : {
        code: K
        status?: number
        message: string
        data: InferErrorData<E[K]>
      }
}[keyof E & string]

type ProtocolErrorByCode<C extends ProtocolErrorCode> = C extends 'VALIDATION'
  ? {
      code: 'VALIDATION'
      status?: number
      message: string
      data: { issues: ValidationIssue[] }
    }
  : { code: C; status?: number; message: string; data?: unknown }

type ProtocolClientError = ProtocolErrorByCode<ProtocolErrorCode>

export type ClientError<E extends ErrorMap> =
  | ([keyof E] extends [never] ? never : DeclaredClientError<E>)
  | Exclude<ProtocolClientError, { code: keyof E & string }>

export type InferContractErrors<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: IsContractProcedure<
    T[K]
  > extends false
    ? InferContractErrors<T[K]>
    : ClientError<InferContractProcedure<T[K]>['errors']>
}

export interface ContractResultPromise<T, E> extends Promise<T> {
  readonly '~pfError'?: E
}

export type CallOptions = { signal?: AbortSignal }

export type ProcedureClient<I, O, E extends ErrorMap> = I extends void
  ? (opts?: CallOptions) => ContractResultPromise<O, ClientError<E>>
  : (input: I, opts?: CallOptions) => ContractResultPromise<O, ClientError<E>>

export type ContractClient<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: IsContractProcedure<
    T[K]
  > extends false
    ? ContractClient<T[K]>
    : ProcedureClient<
        InferContractProcedure<T[K]>['input'],
        InferContractProcedure<T[K]>['output'],
        InferContractProcedure<T[K]>['errors']
      >
}
