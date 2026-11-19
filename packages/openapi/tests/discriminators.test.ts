import { procedure, router } from '@ts-pf/contract'
import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { openapi } from '../src/openapi.js'
import type { OpenAPIOptions } from '../src/types.js'
import { appContract } from './app-contract.js'
import { unresolvedRefs } from './resolve-refs.js'

function build(contract: unknown, options: Omit<OpenAPIOptions, 'info'>) {
  const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
    info: { title: 'Library API', version: '1' },
    ...options,
  })
  expect(unresolvedRefs(spec)).toEqual([])
  return spec.components.schemas
}

const ref = (name: string) => `#/components/schemas/${name}`

describe('discriminators', () => {
  it('maps each tag value to its variant component', () => {
    const schemas = build(appContract, { discriminators: true })
    expect(schemas['book.media.Output']).toEqual({
      oneOf: [{ $ref: ref('PrintMedia') }, { $ref: ref('AudioMedia') }],
      discriminator: {
        propertyName: 'kind',
        mapping: { print: ref('PrintMedia'), audio: ref('AudioMedia') },
      },
    })
    expect(schemas['book.watch.Output']).toMatchObject({
      discriminator: {
        propertyName: 'type',
        mapping: { added: ref('BookAdded'), removed: ref('BookRemoved') },
      },
    })
  })

  it('is off by default', () => {
    const schemas = build(appContract, {})
    expect(schemas['book.media.Output']).not.toHaveProperty('discriminator')
  })

  it('accepts a one-value enum tag and an anyOf', () => {
    const A = z.object({ kind: z.enum(['a']), x: z.string() }).meta({ id: 'A' })
    const B = z
      .object({ kind: z.literal('b'), y: z.string() })
      .meta({ id: 'B' })
    const schemas = build(router({ get: procedure.output(z.union([A, B])) }), {
      discriminators: true,
    })
    expect(schemas['get.Output']).toMatchObject({
      anyOf: [{ $ref: ref('A') }, { $ref: ref('B') }],
      discriminator: {
        propertyName: 'kind',
        mapping: { a: ref('A'), b: ref('B') },
      },
    })
  })

  it('skips unions that do not qualify', () => {
    const A = z.object({ kind: z.literal('a') }).meta({ id: 'A' })
    const Same = z.object({ kind: z.literal('a') }).meta({ id: 'Same' })
    const Optional = z
      .object({ kind: z.literal('o').optional() })
      .meta({ id: 'Optional' })
    const Numeric = z.object({ kind: z.literal(1) }).meta({ id: 'Numeric' })
    const schemas = build(
      router({
        inline: procedure.output(
          z.union([A, z.object({ kind: z.literal('b') })]),
        ),
        duplicate: procedure.output(z.union([A, Same])),
        optional: procedure.output(z.union([A, Optional])),
        numeric: procedure.output(z.union([A, Numeric])),
      }),
      { discriminators: true },
    )
    for (const name of ['inline', 'duplicate', 'optional', 'numeric']) {
      expect(schemas[`${name}.Output`]).not.toHaveProperty('discriminator')
    }
  })

  it('picks the alphabetically first tag when several qualify', () => {
    const A = z
      .object({ type: z.literal('a'), kind: z.literal('x') })
      .meta({ id: 'A' })
    const B = z
      .object({ type: z.literal('b'), kind: z.literal('y') })
      .meta({ id: 'B' })
    const schemas = build(router({ get: procedure.output(z.union([A, B])) }), {
      discriminators: true,
    })
    expect(schemas['get.Output']).toMatchObject({
      discriminator: { propertyName: 'kind' },
    })
  })
})
