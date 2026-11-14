// Structural stand-in for typebox `Static`. Published contract types must not
// import the optional peer: a type-only import is emitted into schema.d.ts,
// and `skipLibCheck: false` then fails with TS2307 unless the consumer
// installs typebox. Encode direction, same as `Static<>` (not `StaticDecode`).
// Extend this walk when a parity case in typebox-static.test-d.ts drifts;
// do not import `typebox` to close the gap.

export type InferTypeBox<S> = TypeBoxStatic<S, {}, {}>

type TypeBoxStatic<S, Context, This> = S extends { '~codec': unknown }
  ? TypeBoxStatic<Omit<S, '~codec'>, Context, This>
  : S extends { '~kind': 'Any' }
    ? AnyStatic
    : S extends { '~kind': 'Unknown' }
      ? unknown
      : S extends { '~kind': 'Never' }
        ? never
        : S extends { '~kind': 'String' }
          ? string
          : S extends { '~kind': 'Number' }
            ? number
            : S extends { '~kind': 'Integer' }
              ? number
              : S extends { '~kind': 'Boolean' }
                ? boolean
                : S extends { '~kind': 'Null' }
                  ? null
                  : S extends { '~kind': 'Undefined' }
                    ? undefined
                    : S extends { '~kind': 'Void' }
                      ? VoidStatic
                      : S extends { '~kind': 'BigInt' }
                        ? bigint
                        : S extends { '~kind': 'Symbol' }
                          ? symbol
                          : S extends { '~kind': 'Literal'; const: infer Value }
                            ? Value
                            : S extends {
                                  '~kind': 'Enum'
                                  enum: infer Values extends readonly (
                                    | string
                                    | number
                                  )[]
                                }
                              ? Values[number]
                              : S extends {
                                    '~kind': 'Object'
                                    properties: infer Properties
                                  }
                                ? ObjectStatic<Properties, Context>
                                : S extends {
                                      '~kind': 'Array'
                                      items: infer Item
                                    }
                                  ? Immutable<
                                      S,
                                      TypeBoxStatic<Item, Context, This>[]
                                    >
                                  : S extends {
                                        '~kind': 'Union'
                                        anyOf: infer Types
                                      }
                                    ? UnionStatic<Types, Context, This>
                                    : S extends {
                                          '~kind': 'Intersect'
                                          allOf: infer Types
                                        }
                                      ? IntersectStatic<Types, Context, This>
                                      : S extends {
                                            '~kind': 'Tuple'
                                            items: infer Items
                                          }
                                        ? Immutable<
                                            S,
                                            TupleStatic<Items, Context, This>
                                          >
                                        : S extends {
                                              '~kind': 'Record'
                                              patternProperties: infer Patterns
                                            }
                                          ? RecordStatic<
                                              Patterns,
                                              Context,
                                              This
                                            >
                                          : S extends { '~kind': 'This' }
                                            ? ObjectStatic<This, Context>
                                            : S extends {
                                                  '~kind': 'Cyclic'
                                                  $defs: infer Defs
                                                  $ref: infer Ref extends string
                                                }
                                              ? Ref extends keyof Defs
                                                ? TypeBoxStatic<
                                                    Defs[Ref],
                                                    Defs,
                                                    This
                                                  >
                                                : never
                                              : S extends {
                                                    '~kind': 'Ref'
                                                    $ref: infer Ref extends
                                                      string
                                                  }
                                                ? Ref extends keyof Context
                                                  ? TypeBoxStatic<
                                                      Context[Ref],
                                                      Context,
                                                      This
                                                    >
                                                  : unknown
                                                : S extends {
                                                      '~kind': 'TemplateLiteral'
                                                      pattern: infer Pattern extends
                                                        string
                                                    }
                                                  ? TemplateStatic<Pattern>
                                                  : S extends {
                                                        '~kind': 'Function'
                                                        parameters: infer Params
                                                        returnType: infer Return
                                                      }
                                                    ? (
                                                        ...args: TupleStatic<
                                                          Params,
                                                          Context,
                                                          This
                                                        >
                                                      ) => TypeBoxStatic<
                                                        Return,
                                                        Context,
                                                        This
                                                      >
                                                    : S extends {
                                                          '~kind': 'Constructor'
                                                          parameters: infer Params
                                                          instanceType: infer Instance
                                                        }
                                                      ? new (
                                                          ...args: TupleStatic<
                                                            Params,
                                                            Context,
                                                            This
                                                          >
                                                        ) => TypeBoxStatic<
                                                          Instance,
                                                          Context,
                                                          This
                                                        >
                                                      : S extends {
                                                            '~kind': 'Dependent'
                                                            if: infer If
                                                            then: infer Then
                                                            else: infer Else
                                                          }
                                                        ? DependentStatic<
                                                            If,
                                                            Then,
                                                            Else,
                                                            Context,
                                                            This
                                                          >
                                                        : S extends {
                                                              '~unsafe': infer Unsafe
                                                            }
                                                          ? Unsafe
                                                          : unknown

// `any` / `void` are what typebox `Static` produces for `Type.Any()` / `Type.Void()`.
// biome-ignore lint/suspicious/noExplicitAny: matches TypeBox Static<Type.Any()>
type AnyStatic = any
// biome-ignore lint/suspicious/noConfusingVoidType: matches TypeBox Static<Type.Void()>
type VoidStatic = void

type Evaluate<T> = { [K in keyof T]: T[K] } & {}

type IsOptional<S> = S extends { '~optional': true } ? true : false
type IsReadonly<S> = S extends { '~readonly': true } ? true : false

type Immutable<S, T extends readonly unknown[]> = S extends {
  '~immutable': true
}
  ? readonly [...T]
  : T

type ObjectStatic<Properties, Context> = keyof Properties extends never
  ? object
  : Evaluate<WithModifiers<StaticProps<Properties, Context>, Properties>>

type StaticProps<Properties, Context> = {
  [Key in keyof Properties]: TypeBoxStatic<Properties[Key], Context, Properties>
}

type ReadonlyOptionalKeys<Properties> = {
  [Key in keyof Properties]: IsReadonly<Properties[Key]> extends true
    ? IsOptional<Properties[Key]> extends true
      ? Key
      : never
    : never
}[keyof Properties]

type ReadonlyKeys<Properties> = {
  [Key in keyof Properties]: IsReadonly<Properties[Key]> extends true
    ? IsOptional<Properties[Key]> extends true
      ? never
      : Key
    : never
}[keyof Properties]

type OptionalKeys<Properties> = {
  [Key in keyof Properties]: IsOptional<Properties[Key]> extends true
    ? IsReadonly<Properties[Key]> extends true
      ? never
      : Key
    : never
}[keyof Properties]

type RequiredKeys<Properties> = keyof Omit<
  Properties,
  | ReadonlyOptionalKeys<Properties>
  | ReadonlyKeys<Properties>
  | OptionalKeys<Properties>
>

type KeysOf<Props, Keys> = Extract<Keys, keyof Props>

type WithModifiers<Props, Properties> = Readonly<
  Partial<Pick<Props, KeysOf<Props, ReadonlyOptionalKeys<Properties>>>>
> &
  Readonly<Pick<Props, KeysOf<Props, ReadonlyKeys<Properties>>>> &
  Partial<Pick<Props, KeysOf<Props, OptionalKeys<Properties>>>> &
  Required<Pick<Props, KeysOf<Props, RequiredKeys<Properties>>>>

type UnionStatic<Types, Context, This> = Types extends readonly [
  infer Head,
  ...infer Tail,
]
  ? TypeBoxStatic<Head, Context, This> | UnionStatic<Tail, Context, This>
  : never

type IntersectStatic<Types, Context, This> = Types extends readonly [
  infer Head,
  ...infer Tail,
]
  ? TypeBoxStatic<Head, Context, This> & IntersectStatic<Tail, Context, This>
  : unknown

type TupleStatic<Items, Context, This> = Items extends readonly [infer Only]
  ? RestOrElement<Only, [], Context, This>
  : Items extends readonly [infer Head, ...infer Tail]
    ? [...Element<Head, Context, This>, ...TupleStatic<Tail, Context, This>]
    : []

type RestOrElement<
  Schema,
  Acc extends unknown[],
  Context,
  This,
> = Schema extends { '~kind': 'Rest'; items: infer Inner }
  ? Inner extends { '~kind': 'Array'; items: infer Item }
    ? [...Acc, ...Element<Item, Context, This>[0][]]
    : [...Acc, never]
  : [...Acc, ...Element<Schema, Context, This>]

type Element<Schema, Context, This> =
  IsReadonly<Schema> extends true
    ? IsOptional<Schema> extends true
      ? [Readonly<TypeBoxStatic<Schema, Context, This>>?]
      : [Readonly<TypeBoxStatic<Schema, Context, This>>]
    : IsOptional<Schema> extends true
      ? [TypeBoxStatic<Schema, Context, This>?]
      : [TypeBoxStatic<Schema, Context, This>]

// typebox record keys. Must match StringKey / IntegerKey / NumberKey.
type StringKey = '^.*$'
type IntegerKey = '^-?(?:0|[1-9][0-9]*)$'
type NumberKey = '^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$'

type RecordKey<Key extends string> = Key extends StringKey
  ? string
  : Key extends IntegerKey
    ? number
    : Key extends NumberKey
      ? number
      : string

type RecordStatic<Patterns, Context, This> =
  Patterns extends Record<infer Key, infer Value>
    ? Key extends string
      ? Record<RecordKey<Key>, TypeBoxStatic<Value, Context, This>>
      : never
    : never

type DependentStatic<If, Then, Else, Context, This> =
  | (TypeBoxStatic<If, Context, This> & TypeBoxStatic<Then, Context, This>)
  | Exclude<
      TypeBoxStatic<Else, Context, This>,
      TypeBoxStatic<If, Context, This>
    >

// Encoded template patterns (`^id-${NumberPattern}$`) decode back to the
// same template `Static` builds. An unrecognized pattern widens to string
// rather than leaking the regex.
type NumberPattern = '-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?'
type IntegerPattern = '-?(?:0|[1-9][0-9]*)'
type BigIntPattern = '-?(?:0|[1-9][0-9]*)n'
type StringPattern = '.*'

type TemplateStatic<Pattern extends string> = Pattern extends `^${infer Inner}$`
  ? CleanPattern<FromParts<Inner>>
  : string

type FromParts<Pattern extends string> =
  Pattern extends `${infer Head}${NumberPattern}`
    ? `${FromParts<Head>}${number}`
    : Pattern extends `${infer Head}${IntegerPattern}`
      ? `${FromParts<Head>}${number}`
      : Pattern extends `${infer Head}${BigIntPattern}`
        ? `${FromParts<Head>}${bigint}`
        : Pattern extends `${infer Head}${StringPattern}`
          ? `${FromParts<Head>}${string}`
          : Pattern

type CleanPattern<Pattern extends string> =
  Pattern extends `${string}(?:${string}`
    ? string
    : Pattern extends `${string}(?${string}`
      ? string
      : Pattern
