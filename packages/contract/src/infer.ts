import type { ErrorMap, InferErrorData } from './errors.js'
import type { ExpandResult, Expansion } from './expand.js'
import type { ContractProcedure } from './procedure.js'
import type { ValidationIssue } from './schema-types.js'

/**
 * The `{ input, parsedInput, output, errors, meta, expand }` of one contract procedure
 * type, or `never` for anything else (a router object, a plain value).
 * `input` is what a caller sends; `parsedInput` is what the handler receives.
 * Matches a `ContractBuilder` (which implements `ContractProcedure`, phantom
 * `~types` included) and a hand-written `ContractProcedure<I, O, E, M>`
 * (codegen output) alike, so consumers need one branch, not two.
 * `expand` is the procedure's `Expansion`, or `never`.
 */
export type InferContractProcedure<T> =
  T extends ContractProcedure<
    infer I,
    infer O,
    infer E,
    infer M,
    infer P,
    infer X
  >
    ? { input: I; parsedInput: P; output: O; errors: E; meta: M; expand: X }
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

/**
 * One procedure's call signature. With an `Expansion` (`X`), the call is
 * generic in the expansion list it passes: a literal list narrows the
 * output, no list gives the plain output, a non-literal array the wide one.
 */
export type ProcedureClient<I, O, E extends ErrorMap, X = never> = [X] extends [
  never,
]
  ? PlainProcedureClient<I, O, E>
  : X extends Expansion
    ? ExpandingProcedureClient<I, O, E, X>
    : PlainProcedureClient<I, O, E>

/**
 * Checks on `I` wrap it in a tuple so a union input (`A | B`) stays one
 * parameter type. A bare `I extends …` would distribute into a union of
 * functions, whose call needs `A & B`.
 */
type PlainProcedureClient<I, O, E extends ErrorMap> =
  IsNoInput<I> extends true
    ? (opts?: CallOptions) => ContractResultPromise<O, ClientError<E>>
    : (...args: InputArgs<I>) => ContractResultPromise<O, ClientError<E>>

type ExpandingProcedureClient<I, O, E extends ErrorMap, X extends Expansion> = <
  const P extends readonly (keyof X['fields'] & string)[] = readonly [],
>(
  ...args: InputArgs<I, I & { readonly [K in X['key']]?: P | undefined }>
) => ContractResultPromise<ExpandResult<O, X, P>, ClientError<E>>

/** `void` (no `.input()`) or `never`, but not `any`. */
// biome-ignore lint/suspicious/noConfusingVoidType: void is the no-input marker
type IsNoInput<I> = 0 extends 1 & I ? false : [I] extends [void] ? true : false

/**
 * `(input: T, opts?)`. When input `I` accepts `undefined` (`.optional()`,
 * `unknown`, `any`), the input may be omitted.
 */
type InputArgs<I, T = I> = [undefined] extends [I]
  ? [input?: T | undefined, opts?: CallOptions | undefined]
  : [input: T, opts?: CallOptions | undefined]

/** The expandable field names of procedure `T`, or `never`. */
export type InferExpansionKeys<T> =
  InferContractProcedure<T>['expand'] extends infer X extends Expansion
    ? keyof X['fields'] & string
    : never

/**
 * The output procedure `T` returns for the expansion list `P` (a tuple, e.g.
 * `['authorId']`), as a call passing that list would type it. Without an
 * expansion it is the output. Use it to annotate what a call does not type,
 * e.g. `useSWR<InferExpandedOutput<typeof contract.posts.get, ['authorId']>>`.
 */
export type InferExpandedOutput<
  T,
  P extends readonly InferExpansionKeys<T>[] = readonly [],
> = [InferContractProcedure<T>] extends [never]
  ? never
  : [InferContractProcedure<T>['expand']] extends [never]
    ? InferContractProcedure<T>['output']
    : InferContractProcedure<T>['expand'] extends infer X extends Expansion
      ? ExpandResult<InferContractProcedure<T>['output'], X, P>
      : InferContractProcedure<T>['output']

export type ContractClient<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: IsContractProcedure<
    T[K]
  > extends false
    ? ContractClient<T[K]>
    : ProcedureClient<
        InferContractProcedure<T[K]>['input'],
        InferContractProcedure<T[K]>['output'],
        InferContractProcedure<T[K]>['errors'],
        InferContractProcedure<T[K]>['expand']
      >
}
