import type {
  ClientError,
  ErrorMap,
  InferContractProcedure,
  IsContractProcedure,
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

type DeepPartial<T> = T extends object
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

/**
 * With an expansion (`X`), the callable and `call` narrow per call; `key`,
 * `fetcher`, and `mutator` give the wide output (SWR infers data from the
 * fetcher, which cannot see the key's list). For narrowed `useSWR` data,
 * pass a fetcher that calls the procedure: `() => utils.posts.get(input)`.
 */
export type SwrProcedureUtils<
  I,
  O,
  E extends ErrorMap,
  X = never,
> = ProcedureClient<I, O, E, X> &
  SwrRouterUtils<I> &
  SwrStreamHelpers<I, O, E> & {
    key: I extends void
      ? (options?: SwrKeyOptions<I>) => SwrKey<I>
      : (options: SwrKeyOptions<I>) => SwrKey<I>
    fetcher: () => SwrFetcher<I, O>
    mutator: () => SwrMutator<I, O>
    call: ProcedureClient<I, O, E, X>
  }

export type SwrClient<T> = {
  [K in keyof T as K extends '~pf' ? never : K]: IsContractProcedure<
    T[K]
  > extends false
    ? SwrClient<T[K]>
    : SwrProcedureUtils<
        InferContractProcedure<T[K]>['input'],
        InferContractProcedure<T[K]>['output'],
        InferContractProcedure<T[K]>['errors'],
        InferContractProcedure<T[K]>['expand']
      >
} & SwrRouterUtils
