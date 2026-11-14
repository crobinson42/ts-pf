import {
  type InferContractProcedure,
  type InferSchemaInput,
  type InferSchemaOutput,
  procedure,
} from '@ts-pf/contract'
import Type, { type Static } from 'typebox'
import { describe, expectTypeOf, it } from 'vitest'

type Out<S> = InferSchemaOutput<S>
type In<S> = InferSchemaInput<S>

describe('TypeBox inference without importing typebox', () => {
  it('matches Static for objects, modifiers, and quoted keys', () => {
    const named = Type.Object({ name: Type.String() })
    expectTypeOf<Out<typeof named>>().toEqualTypeOf<Static<typeof named>>()
    expectTypeOf<In<typeof named>>().toEqualTypeOf<Static<typeof named>>()

    const empty = Type.Object({})
    expectTypeOf<Out<typeof empty>>().toEqualTypeOf<Static<typeof empty>>()
    expectTypeOf<In<typeof empty>>().toEqualTypeOf<Static<typeof empty>>()

    const modified = Type.Object({
      id: Type.Number(),
      name: Type.Optional(Type.String()),
      tag: Type.Readonly(Type.String()),
      note: Type.Readonly(Type.Optional(Type.String())),
    })
    expectTypeOf<Out<typeof modified>>().toEqualTypeOf<
      Static<typeof modified>
    >()
    expectTypeOf<In<typeof modified>>().toEqualTypeOf<Static<typeof modified>>()

    const quoted = Type.Object({
      'kebab-case': Type.String(),
      class: Type.Boolean(),
    })
    expectTypeOf<Out<typeof quoted>>().toEqualTypeOf<Static<typeof quoted>>()
    expectTypeOf<In<typeof quoted>>().toEqualTypeOf<Static<typeof quoted>>()
  })

  it('matches Static for unions, intersects, tuples, and records', () => {
    const union = Type.Union([Type.String(), Type.Number()])
    expectTypeOf<Out<typeof union>>().toEqualTypeOf<Static<typeof union>>()
    expectTypeOf<In<typeof union>>().toEqualTypeOf<Static<typeof union>>()

    const nullable = Type.Union([Type.String(), Type.Null()])
    expectTypeOf<Out<typeof nullable>>().toEqualTypeOf<
      Static<typeof nullable>
    >()
    expectTypeOf<In<typeof nullable>>().toEqualTypeOf<Static<typeof nullable>>()

    const intersect = Type.Intersect([
      Type.Object({ a: Type.String() }),
      Type.Object({ b: Type.Number() }),
    ])
    expectTypeOf<Out<typeof intersect>>().toEqualTypeOf<
      Static<typeof intersect>
    >()
    expectTypeOf<In<typeof intersect>>().toEqualTypeOf<
      Static<typeof intersect>
    >()

    const tuple = Type.Tuple([Type.String(), Type.Number()])
    expectTypeOf<Out<typeof tuple>>().toEqualTypeOf<Static<typeof tuple>>()
    expectTypeOf<In<typeof tuple>>().toEqualTypeOf<Static<typeof tuple>>()

    const optionalTuple = Type.Tuple([
      Type.String(),
      Type.Optional(Type.Number()),
    ])
    expectTypeOf<Out<typeof optionalTuple>>().toEqualTypeOf<
      Static<typeof optionalTuple>
    >()
    expectTypeOf<In<typeof optionalTuple>>().toEqualTypeOf<
      Static<typeof optionalTuple>
    >()

    const record = Type.Record(Type.String(), Type.Number())
    expectTypeOf<Out<typeof record>>().toEqualTypeOf<Static<typeof record>>()
    expectTypeOf<In<typeof record>>().toEqualTypeOf<Static<typeof record>>()

    const intRecord = Type.Record(Type.Integer(), Type.String())
    expectTypeOf<Out<typeof intRecord>>().toEqualTypeOf<
      Static<typeof intRecord>
    >()
    expectTypeOf<In<typeof intRecord>>().toEqualTypeOf<
      Static<typeof intRecord>
    >()

    const numRecord = Type.Record(Type.Number(), Type.Boolean())
    expectTypeOf<Out<typeof numRecord>>().toEqualTypeOf<
      Static<typeof numRecord>
    >()
    expectTypeOf<In<typeof numRecord>>().toEqualTypeOf<
      Static<typeof numRecord>
    >()
  })

  it('matches Static for literals, enums, and primitives', () => {
    const literal = Type.Literal('x')
    expectTypeOf<Out<typeof literal>>().toEqualTypeOf<Static<typeof literal>>()
    expectTypeOf<In<typeof literal>>().toEqualTypeOf<Static<typeof literal>>()

    const literalNum = Type.Literal(1)
    expectTypeOf<Out<typeof literalNum>>().toEqualTypeOf<
      Static<typeof literalNum>
    >()
    expectTypeOf<In<typeof literalNum>>().toEqualTypeOf<
      Static<typeof literalNum>
    >()

    const enumerated = Type.Enum({ a: 'a', b: 'b' })
    expectTypeOf<Out<typeof enumerated>>().toEqualTypeOf<
      Static<typeof enumerated>
    >()
    expectTypeOf<In<typeof enumerated>>().toEqualTypeOf<
      Static<typeof enumerated>
    >()

    const integer = Type.Integer()
    expectTypeOf<Out<typeof integer>>().toEqualTypeOf<Static<typeof integer>>()
    expectTypeOf<In<typeof integer>>().toEqualTypeOf<Static<typeof integer>>()

    const big = Type.BigInt()
    expectTypeOf<Out<typeof big>>().toEqualTypeOf<Static<typeof big>>()
    expectTypeOf<In<typeof big>>().toEqualTypeOf<Static<typeof big>>()

    const empty = Type.Void()
    expectTypeOf<Out<typeof empty>>().toEqualTypeOf<Static<typeof empty>>()
    expectTypeOf<In<typeof empty>>().toEqualTypeOf<Static<typeof empty>>()

    const missing = Type.Undefined()
    expectTypeOf<Out<typeof missing>>().toEqualTypeOf<Static<typeof missing>>()
    expectTypeOf<In<typeof missing>>().toEqualTypeOf<Static<typeof missing>>()

    const anySchema = Type.Any()
    expectTypeOf<Out<typeof anySchema>>().toEqualTypeOf<
      Static<typeof anySchema>
    >()
    expectTypeOf<In<typeof anySchema>>().toEqualTypeOf<
      Static<typeof anySchema>
    >()

    const unknownSchema = Type.Unknown()
    expectTypeOf<Out<typeof unknownSchema>>().toEqualTypeOf<
      Static<typeof unknownSchema>
    >()
    expectTypeOf<In<typeof unknownSchema>>().toEqualTypeOf<
      Static<typeof unknownSchema>
    >()

    const neverSchema = Type.Never()
    expectTypeOf<Out<typeof neverSchema>>().toEqualTypeOf<
      Static<typeof neverSchema>
    >()
    expectTypeOf<In<typeof neverSchema>>().toEqualTypeOf<
      Static<typeof neverSchema>
    >()

    const list = Type.Array(Type.String())
    expectTypeOf<Out<typeof list>>().toEqualTypeOf<Static<typeof list>>()
    expectTypeOf<In<typeof list>>().toEqualTypeOf<Static<typeof list>>()

    const frozen = Type.Immutable(Type.Array(Type.Number()))
    expectTypeOf<Out<typeof frozen>>().toEqualTypeOf<Static<typeof frozen>>()
    expectTypeOf<In<typeof frozen>>().toEqualTypeOf<Static<typeof frozen>>()
  })

  it('matches Static for recursive, cyclic, and template schemas', () => {
    const tree = Type.Object({
      name: Type.String(),
      children: Type.Array(Type.This()),
    })
    expectTypeOf<Out<typeof tree>>().toEqualTypeOf<Static<typeof tree>>()
    expectTypeOf<In<typeof tree>>().toEqualTypeOf<Static<typeof tree>>()

    const cyclic = Type.Cyclic(
      {
        Node: Type.Object({
          name: Type.String(),
          children: Type.Array(Type.Ref('Node')),
        }),
      },
      'Node',
    )
    expectTypeOf<Out<typeof cyclic>>().toEqualTypeOf<Static<typeof cyclic>>()
    expectTypeOf<In<typeof cyclic>>().toEqualTypeOf<Static<typeof cyclic>>()

    const template = Type.TemplateLiteral([Type.Literal('id-'), Type.Number()])
    expectTypeOf<Out<typeof template>>().toEqualTypeOf<
      Static<typeof template>
    >()
    expectTypeOf<In<typeof template>>().toEqualTypeOf<Static<typeof template>>()

    const fn = Type.Function([Type.String()], Type.Number())
    expectTypeOf<Out<typeof fn>>().toEqualTypeOf<Static<typeof fn>>()
    expectTypeOf<In<typeof fn>>().toEqualTypeOf<Static<typeof fn>>()

    const ctor = Type.Constructor([Type.String()], Type.Number())
    expectTypeOf<Out<typeof ctor>>().toEqualTypeOf<Static<typeof ctor>>()
    expectTypeOf<In<typeof ctor>>().toEqualTypeOf<Static<typeof ctor>>()

    const dependent = Type.Dependent(
      Type.Literal('yes'),
      Type.Literal('yes'),
      Type.Literal('no'),
    )
    expectTypeOf<Out<typeof dependent>>().toEqualTypeOf<
      Static<typeof dependent>
    >()
    expectTypeOf<In<typeof dependent>>().toEqualTypeOf<
      Static<typeof dependent>
    >()

    const rest = Type.Tuple([
      Type.String(),
      Type.Rest(Type.Array(Type.Number())),
    ])
    expectTypeOf<Out<typeof rest>>().toEqualTypeOf<Static<typeof rest>>()
    expectTypeOf<In<typeof rest>>().toEqualTypeOf<Static<typeof rest>>()
  })

  it('infers a TypeBox procedure the same way Static does', () => {
    const created = procedure
      .input(Type.Object({ name: Type.String() }))
      .output(Type.Object({ id: Type.Number(), name: Type.String() }))
    type Created = InferContractProcedure<typeof created>
    expectTypeOf<Created['input']>().toEqualTypeOf<{ name: string }>()
    expectTypeOf<Created['output']>().toEqualTypeOf<{
      id: number
      name: string
    }>()
  })
})
