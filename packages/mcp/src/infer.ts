import type {
  ErrorMap,
  InferContractProcedure,
  IsContractProcedure,
} from '@ts-pf/contract'

export type MaybePromise<T> = T | Promise<T>

/** Router keys without the `~pf` brand. */
export type Keys<T> = Exclude<keyof T & string, '~pf'>

export type KeysOfUnion<T> = T extends unknown ? keyof T : never
export type FieldOf<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never
/** `Omit` per union member, so a union input keeps its branches. */
export type DistOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

export type In<P> = InferContractProcedure<P>['input']
export type Out<P> = InferContractProcedure<P>['output']
export type Meta<P> = InferContractProcedure<P>['meta']
export type Err<P> = InferContractProcedure<P>['errors'] extends infer E extends
  ErrorMap
  ? E
  : {}

/** Every procedure path of a contract, dot-joined; a literal `docs({ hidden: true })` is left out. */
export type ProcPaths<T, P extends string = ''> = {
  [K in Keys<T>]: IsContractProcedure<T[K]> extends true
    ? Meta<T[K]> extends { docs: { hidden: true } }
      ? never
      : `${P}${K}`
    : ProcPaths<T[K], `${P}${K}.`>
}[Keys<T>]
