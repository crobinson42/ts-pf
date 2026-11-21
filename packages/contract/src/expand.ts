import type { AnySchema, InferSchemaOutput } from './schema.js'

/**
 * The expansion a procedure declares with `.expand()`: the input field that
 * lists what to expand (`Key`), where in the output the expandable fields sit
 * (`At`, a key path; arrays and `null` / `undefined` are passed through), and
 * each field's expanded **output type** (`Fields`, types, not schemas).
 *
 * It is the 6th type parameter of `ContractProcedure`. The builder fills it;
 * a hand-written contract type (codegen output, or a mapped type) writes it:
 * `ContractProcedure<I, O, E, M, I, Expansion<'populate', ['docs'], { authorId: User }>>`.
 */
export type Expansion<
  Key extends string = string,
  At extends readonly string[] = readonly string[],
  Fields extends Record<string, unknown> = Record<string, unknown>,
> = { readonly key: Key; readonly at: At; readonly fields: Fields }

/** Runtime record of `.expand()` on `ContractProcedureDef`. */
export type ContractExpandDef = {
  key: string
  at: readonly string[]
  fields: Record<string, AnySchema>
}

/** `.expand()` argument. `fields` holds schemas; `at` defaults to the root. */
export type ExpandSpec<
  K extends string,
  A extends readonly string[],
  F extends Record<string, unknown>,
> = { key: K; at?: A; fields: F }

/** Expanded output types of a `fields` schema map. */
export type ExpandFields<F> = { [K in keyof F]: InferSchemaOutput<F[K]> } & {}

type Nullish = null | undefined
type Flat<T> = { [K in keyof T]: T[K] } & {}

// `undefined` when `K` is an optional key of `T`: under
// `exactOptionalPropertyTypes` an optional key's `T[K]` carries `undefined`,
// which a non-homomorphic value must drop to keep `?: X` (not `?: X | undefined`).
type Opt<T, K extends keyof T> = {} extends Pick<T, K> ? undefined : never

// A field whose unexpanded type is only `undefined` exists only when expanded
// (an optional list such as `categories?: Link[]`): left out when not asked for, required when it is.
type Added<T, F, K extends keyof T> = K extends keyof F
  ? [Exclude<T[K], F[K] | undefined>] extends [never]
    ? true
    : false
  : false

type ExpandObject<T, F, P> = T extends readonly (infer U)[]
  ? ExpandObject<U, F, P>[]
  : T extends Nullish
    ? T
    : Flat<
        {
          [K in keyof T as Added<T, F, K> extends true
            ? never
            : K]: K extends keyof F
            ? K extends P
              ?
                  | Exclude<F[K], undefined>
                  | Exclude<Extract<T[K], Nullish>, Opt<T, K>>
              : Exclude<T[K], F[K] | Opt<T, K>>
            : T[K]
        } & {
          [K in keyof T as K extends P & keyof F
            ? Added<T, F, K> extends true
              ? K
              : never
            : never]-?: Exclude<F[K & keyof F], undefined>
        }
      >

type ExpandAt<T, Path, F, P> = Path extends readonly [
  infer H extends string,
  ...infer R extends readonly string[],
]
  ? T extends readonly (infer U)[]
    ? ExpandAt<U, Path, F, P>[]
    : T extends Nullish
      ? T
      : Flat<{
          [K in keyof T]: K extends H
            ? Exclude<ExpandAt<T[K], R, F, P>, Opt<T, K>>
            : T[K]
        }>
  : ExpandObject<T, F, P>

/**
 * `O` with the fields named in `P` (a union of field names) expanded and the
 * other expandable fields in their plain form.
 */
export type ExpandedOutput<O, X extends Expansion, P> = ExpandAt<
  O,
  X['at'],
  X['fields'],
  P
>

/**
 * What a call that passes `P` as the expansion list returns. A tuple `P`
 * (a literal list) narrows; a non-tuple array (a variable of type `K[]`)
 * could hold any subset, so it returns the wide output.
 */
export type ExpandResult<
  O,
  X extends Expansion,
  P extends readonly unknown[],
> = number extends P['length'] ? O : ExpandedOutput<O, X, P[number]>

// ---------------------------------------------------------------- checks

/** The object type(s) `Path` reaches in `T`, arrays and nullish unwrapped. */
type Target<T, Path> = T extends readonly (infer U)[]
  ? Target<U, Path>
  : T extends Nullish
    ? never
    : Path extends readonly [
          infer H extends string,
          ...infer R extends readonly string[],
        ]
      ? H extends keyof T
        ? Target<T[H], R>
        : never
      : T extends object
        ? T
        : never

type Join<Path> = Path extends readonly [
  infer H extends string,
  ...infer R extends readonly string[],
]
  ? R extends readonly []
    ? H
    : `${H}.${Join<R>}`
  : ''

type BadField<O, F> = {
  [K in keyof F & string]: K extends keyof O
    ? [F[K]] extends [O[K]]
      ? never
      : K
    : K
}[keyof F & string]

/**
 * `{}` when an expansion fits the procedure, else `{ '~error': '…' }`, which
 * the `.expand()` argument cannot satisfy, so the message is the error.
 */
export type ExpandCheck<
  I,
  O,
  K extends string,
  A extends readonly string[],
  F,
> = K extends keyof I // also false without an input (`keyof void` is never)
  ? [Array<keyof F & string>] extends [Exclude<I[K], undefined>]
    ? [Target<O, A>] extends [never]
      ? { '~error': `expand: the output has no object at "${Join<A>}"` }
      : [BadField<Target<O, A>, F>] extends [never]
        ? {}
        : {
            '~error': `expand: field "${BadField<Target<O, A>, F>}" is not in the output, or the output field does not accept its expanded type`
          }
    : {
        '~error': `expand: input field "${K}" must accept an array of the expandable field names`
      }
  : { '~error': `expand: the input has no "${K}" field` }
