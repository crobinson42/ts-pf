import { procedure, router } from '@ts-pf/contract'
import { stream } from '@ts-pf/stream'
import Type from 'typebox'
import { z } from 'zod'

function echo<S>(schema: S) {
  return procedure.input(schema).output(schema)
}

const ZodNode: z.ZodType<{ name: string; child?: unknown }> = z.object({
  name: z.string(),
  get child() {
    return ZodNode.optional()
  },
})

const ZodLazy: z.ZodType<{ name: string; children: unknown[] }> = z.lazy(() =>
  z.object({
    name: z.string(),
    children: z.array(ZodLazy),
  }),
)

const closedObject = z.object({ id: z.number(), name: z.string().optional() })

export const ioMatrixContract = router({
  zod: {
    primitives: {
      string: echo(z.string()),
      number: echo(z.number()),
      int: echo(z.int()),
      boolean: echo(z.boolean()),
      null: echo(z.null()),
      unknown: echo(z.unknown()),
      any: echo(z.any()),
      never: echo(z.never()),
    },
    literals: {
      string: echo(z.literal('x')),
      number: echo(z.literal(1)),
      boolean: echo(z.literal(true)),
      null: echo(z.literal(null)),
    },
    enums: {
      string: echo(z.enum(['a', 'b'])),
      numeric: echo(z.enum({ A: 1, B: 2 })),
    },
    nullability: {
      nullable: echo(z.string().nullable()),
      optional: echo(z.object({ name: z.string().optional() })),
      nullish: echo(z.object({ name: z.string().nullish() })),
    },
    objects: {
      closed: echo(closedObject),
      strict: echo(z.object({ id: z.number() }).strict()),
      passthrough: echo(z.object({ id: z.number() }).passthrough()),
      catchall: echo(z.object({ id: z.number() }).catchall(z.string())),
      partial: echo(z.object({ a: z.string(), b: z.number() }).partial()),
      extend: echo(z.object({ a: z.string() }).extend({ b: z.number() })),
      merge: echo(
        z.object({ a: z.string() }).merge(z.object({ b: z.number() })),
      ),
      pick: echo(z.object({ a: z.string(), b: z.number() }).pick({ a: true })),
      omit: echo(z.object({ a: z.string(), b: z.number() }).omit({ b: true })),
      empty: echo(z.object({})),
      nested: echo(
        z.object({ a: z.object({ b: z.object({ c: z.string() }) }) }),
      ),
      quoted: echo(
        z.object({
          'kebab-case': z.string(),
          'with space': z.number(),
          class: z.boolean(),
        }),
      ),
      record: echo(z.record(z.string(), z.number())),
      recordEnum: echo(z.record(z.enum(['a', 'b']), z.number())),
    },
    arrays: {
      strings: echo(z.array(z.string())),
      unionItems: echo(z.array(z.union([z.string(), z.number()]))),
      tuple: echo(z.tuple([z.string(), z.number()])),
      tupleRest: echo(z.tuple([z.string()], z.number())),
    },
    unions: {
      primitives: echo(z.union([z.string(), z.number()])),
      objects: echo(
        z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]),
      ),
      literals: echo(z.union([z.literal('a'), z.literal('b')])),
      discriminated: echo(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('a'), n: z.number() }),
          z.object({ type: z.literal('b'), s: z.string() }),
        ]),
      ),
      intersection: echo(
        z.intersection(
          z.object({ a: z.string() }),
          z.object({ b: z.number() }),
        ),
      ),
    },
    recursive: {
      getter: echo(ZodNode),
      lazy: echo(ZodLazy),
    },
    formats: {
      email: echo(z.email()),
      uuid: echo(z.uuid()),
      datetime: echo(z.iso.datetime()),
      url: echo(z.url()),
      branded: echo(z.string().brand('UserId')),
      file: echo(z.file()),
    },
    io: {
      defaulted: procedure
        .input(z.object({ a: z.string().default('x') }))
        .output(z.object({ a: z.string().default('x') })),
      pipe: procedure
        .input(z.string().pipe(z.coerce.number()))
        .output(z.string().pipe(z.coerce.number())),
      transformIn: procedure
        .input(z.string().transform((value) => value.length))
        .output(z.number()),
      transformOut: procedure.output(
        z.string().transform((value) => value.length),
      ),
    },
    unrepresentable: {
      date: echo(z.date()),
      bigint: echo(z.bigint()),
      map: echo(z.map(z.string(), z.number())),
      set: echo(z.set(z.string())),
      void: echo(z.void()),
      undefined: echo(z.undefined()),
      nan: echo(z.nan()),
      symbol: echo(z.symbol()),
      literalUndefined: echo(z.literal(undefined)),
      dateField: echo(z.object({ at: z.date() })),
    },
  },
  typebox: {
    object: echo(
      Type.Object({ id: Type.Number(), name: Type.Optional(Type.String()) }),
    ),
    empty: echo(Type.Object({})),
    union: echo(Type.Union([Type.String(), Type.Number()])),
    nullable: echo(Type.Union([Type.String(), Type.Null()])),
    intersect: echo(
      Type.Intersect([
        Type.Object({ a: Type.String() }),
        Type.Object({ b: Type.Number() }),
      ]),
    ),
    tuple: echo(Type.Tuple([Type.String(), Type.Number()])),
    record: echo(Type.Record(Type.String(), Type.Number())),
    literal: echo(Type.Literal('x')),
    enum: echo(Type.Enum({ a: 'a', b: 'b' })),
    integer: echo(Type.Integer()),
    thisRecursive: echo(
      Type.Object({
        name: Type.String(),
        children: Type.Array(Type.This()),
      }),
    ),
    cyclic: echo(
      Type.Cyclic(
        {
          Node: Type.Object({
            name: Type.String(),
            children: Type.Array(Type.Ref('Node')),
          }),
        },
        'Node',
      ),
    ),
    quoted: echo(
      Type.Object({ 'kebab-case': Type.String(), class: Type.Boolean() }),
    ),
    template: echo(Type.TemplateLiteral([Type.Literal('id-'), Type.Number()])),
    unrepresentable: {
      bigint: echo(Type.BigInt()),
      void: echo(Type.Void()),
      undefined: echo(Type.Undefined()),
    },
  },
  slots: {
    noInput: procedure.output(z.string()),
    noOutput: procedure.input(z.string()),
    streamOut: procedure.output(stream(z.object({ token: z.string() }))),
    streamIn: procedure.input(stream(z.object({ chunk: z.number() }))),
    streamBoth: procedure
      .input(stream(z.object({ chunk: z.number() })))
      .output(stream(z.object({ token: z.string() }))),
    errorObject: procedure.errors({
      NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
    }),
    errorRecursive: procedure.errors({
      CYCLE: { status: 400, data: ZodNode },
    }),
    errorUnavailable: procedure.errors({
      BAD: { status: 400, data: z.date() },
    }),
  },
  names: {
    'find-planet': echo(z.object({ id: z.number() })),
    class: echo(z.boolean()),
    deep: {
      nest: {
        ping: procedure.output(z.string()),
      },
    },
  },
})
