import { procedure, router } from '@ts-pf/contract'
import { catalog } from '@ts-pf/docs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { openapi } from '../src/openapi.js'
import type { OpenAPIOptions } from '../src/types.js'
import { unresolvedRefs } from './resolve-refs.js'

function build(contract: unknown, options: Omit<OpenAPIOptions, 'info'>) {
  const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
    info: { title: 'Library API', version: '1' },
    ...options,
  })
  expect(unresolvedRefs(spec)).toEqual([])
  return spec
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
})

const library = router({
  book: {
    find: procedure.input(z.object({ isbn: z.string() })).output(
      z.object({
        title: z.string(),
        author: z.object({
          name: z.string(),
          address: z.object({ city: z.string() }),
        }),
        tags: z.array(z.object({ label: z.string() })),
        extra: z.record(z.string(), z.object({ note: z.string() })),
        editor: z.object({ name: z.string() }).nullable(),
      }),
    ),
  },
})

describe("hoist: 'objects'", () => {
  it('names nested objects after their parent and position (pascal)', () => {
    const { schemas } = build(library, {
      hoist: 'objects',
      naming: 'pascal',
    }).components
    expect(schemas.BookFindOutput).toMatchObject({
      properties: {
        title: { type: 'string' },
        author: ref('BookFindOutputAuthor'),
        tags: { type: 'array', items: ref('BookFindOutputTagsItem') },
        extra: { additionalProperties: ref('BookFindOutputExtraValue') },
        editor: { anyOf: [ref('BookFindOutputEditor'), { type: 'null' }] },
      },
    })
    expect(schemas.BookFindOutputAuthor).toMatchObject({
      properties: { address: ref('BookFindOutputAuthorAddress') },
    })
    expect(schemas.BookFindOutputAuthorAddress).toEqual({
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    })
  })

  it("uses dotted names under naming: 'path'", () => {
    const { schemas } = build(library, { hoist: 'objects' }).components
    expect(schemas['book.find.Output']).toMatchObject({
      properties: {
        author: ref('book.find.Output.author'),
        tags: { items: ref('book.find.Output.tags.Item') },
      },
    })
    expect(schemas).toHaveProperty('book.find.Output.author.address')
  })

  it('shares identical shapes under the alphabetically first name', () => {
    const { schemas } = build(
      router({
        b: procedure.output(z.object({ who: z.object({ id: z.string() }) })),
        a: procedure.output(z.object({ owner: z.object({ id: z.string() }) })),
      }),
      { hoist: 'objects', naming: 'pascal' },
    ).components
    expect(schemas.BOutput).toMatchObject({
      properties: { who: ref('AOutputOwner') },
    })
    expect(schemas.AOutput).toMatchObject({
      properties: { owner: ref('AOutputOwner') },
    })
    expect(schemas).not.toHaveProperty('BOutputWho')
  })

  it('names union variants by tag, else Option<N>', () => {
    const { schemas } = build(
      router({
        tagged: procedure.output(
          z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('circle'), r: z.number() }),
            z.object({ kind: z.literal('square'), side: z.number() }),
          ]),
        ),
        plain: procedure.output(
          z.union([z.object({ a: z.string() }), z.object({ b: z.string() })]),
        ),
        nullable: procedure.output(z.object({ n: z.string() }).nullable()),
      }),
      { hoist: 'objects', naming: 'pascal' },
    ).components
    expect(schemas.TaggedOutput).toEqual({
      oneOf: [ref('TaggedOutputCircle'), ref('TaggedOutputSquare')],
    })
    expect(schemas.PlainOutput).toEqual({
      anyOf: [ref('PlainOutputOption1'), ref('PlainOutputOption2')],
    })
    // At a component root the union's own name is taken.
    expect(schemas.NullableOutput).toEqual({
      anyOf: [ref('NullableOutputOption1'), { type: 'null' }],
    })
  })

  it('never hoists protocol envelopes', () => {
    const per = build(library, { hoist: 'objects' }).components.schemas
    expect(per['TsPf.Error.INTERNAL']).toMatchObject({
      properties: { error: { type: 'object' } },
    })
    expect(per['book.find.Success']).toMatchObject({
      properties: { output: ref('book.find.Output') },
    })
    // Not referenced by any operation, still an envelope.
    expect(per['TsPf.Error.NOT_FOUND']).toMatchObject({
      properties: { error: { type: 'object' } },
    })
    const shared = build(library, {
      hoist: 'objects',
      errors: 'shared',
      naming: 'pascal',
    }).components.schemas
    expect(shared.RpcError).toMatchObject({
      properties: { error: { type: 'object' } },
    })
    expect(shared).toHaveProperty('ValidationErrorDataIssuesItem')
  })

  it('warns once, listing the names it made up', () => {
    build(library, { hoist: 'objects', naming: 'pascal' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(
      /hoist 'objects' named \d+ inline object\(s\): .*BookFindOutputAuthor, .*\.meta\(\{ id \}\)/,
    )
  })

  it('does not warn when nothing is hoisted', () => {
    build(router({ ping: procedure.output(z.object({ ok: z.boolean() })) }), {
      hoist: 'objects',
      protocolErrors: false,
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('throws when one name means two shapes', () => {
    const twoKeys = router({
      a: procedure.output(
        z.object({
          xY: z.object({ x: z.string() }),
          x_y: z.object({ y: z.number() }),
        }),
      ),
    })
    expect(() =>
      build(twoKeys, { hoist: 'objects', naming: 'pascal' }),
    ).toThrow(
      /hoist 'objects' names two different schemas "AOutputXY".*distinct \.meta\(\{ id \}\)/,
    )
    const taken = router({
      a: procedure.output(z.object({ xY: z.object({ x: z.string() }) })),
      b: procedure.output(
        z.object({ q: z.string() }).meta({ id: 'AOutputXY' }),
      ),
    })
    expect(() => build(taken, { hoist: 'objects', naming: 'pascal' })).toThrow(
      /names two different schemas "AOutputXY"/,
    )
  })

  it('is off by default', () => {
    const { schemas } = build(library, { naming: 'pascal' }).components
    expect(schemas).not.toHaveProperty('BookFindOutputAuthor')
    expect(warn).not.toHaveBeenCalled()
  })
})
