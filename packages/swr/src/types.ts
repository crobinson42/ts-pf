import type {
  ClientError,
  ContractBuilder,
  ContractProcedure,
  ErrorMap,
  ProcedureClient,
} from '@ts-pf/contract'

export type SwrKeyInit<I = unknown> = {
  readonly input?: I
}

export type SwrKey<I = unknown> =
  | readonly [path: readonly string[], init: SwrKeyInit<I>]
  | readonly [prefix: string, path: readonly string[], init: SwrKeyInit<I>]

export type SwrFetcher<I = unknown, O = unknown> = (
  key: SwrKey<I>,
) => Promise<O>

export type SwrMutator<I = unknown, O = unknown> = (
  key: unknown,
  options: { arg: I },
) => Promise<O>

export type SwrMatcher = (key?: unknown) => boolean

export type SwrMatcherStrategy = 'exact' | 'partial'

export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T

export type SwrMatcherOptions<I = unknown> = {
  input?: I extends void ? I : DeepPartial<I>
  strategy?: SwrMatcherStrategy
}

export type SwrKeyOptions<I> = I extends void
  ? { input?: undefined }
  : { input: I }

export type SwrSubscriberOptions = {
  refetchMode?: 'append' | 'reset' | 'replace'
  maxChunks?: number
}

export type SwrSubscriptionNext<Data, Err> = (
  error?: Err | null,
  data?: Data | ((previous: Data | undefined) => Data),
) => void

export type SwrSubscriber<I, Data, Err = unknown> = (
  key: SwrKey<I>,
  options: { next: SwrSubscriptionNext<Data, Err> },
) => () => void

export type CreateSwrOptions = {
  prefix?: string
}

export type SwrRouterUtils<I = unknown> = {
  matcher: (options?: SwrMatcherOptions<I>) => SwrMatcher
}

type SwrStreamHelpers<I, O, E extends ErrorMap> = [O] extends [
  AsyncIterable<infer U>,
]
  ? {
      subscriber: (
        options?: SwrSubscriberOptions,
      ) => SwrSubscriber<I, U[], ClientError<E>>
      liveSubscriber: () => SwrSubscriber<I, U, ClientError<E>>
    }
  : {}

export type SwrProcedureUtils<I, O, E extends ErrorMap> = ProcedureClient<
  I,
  O,
  E
> &
  SwrRouterUtils<I> &
  SwrStreamHelpers<I, O, E> & {
    key: I extends void
      ? (options?: SwrKeyOptions<I>) => SwrKey<I>
      : (options: SwrKeyOptions<I>) => SwrKey<I>
    fetcher: () => SwrFetcher<I, O>
    mutator: () => SwrMutator<I, O>
    call: ProcedureClient<I, O, E>
  }

type InferProc<T> =
  T extends ContractBuilder<infer I, infer O, infer E, infer M>
    ? { input: I; output: O; errors: E; meta: M }
    : T extends ContractProcedure<infer I, infer O, infer E, infer M>
      ? { input: I; output: O; errors: E; meta: M }
      : never

export type SwrClient<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: InferProc<T[K]> extends never
    ? SwrClient<T[K]>
    : SwrProcedureUtils<
        InferProc<T[K]>['input'],
        InferProc<T[K]>['output'],
        InferProc<T[K]>['errors']
      >
} & SwrRouterUtils
