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
  return spec.components.schemas
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
})

const contract = router({
  book: {
    find: procedure
      .input(z.object({ status: z.enum(['loaned', 'available', 'lost']) }))
      .output(
        z.object({
          status: z
            .enum(['available', 'loaned', 'lost'])
            .describe('Where the book is'),
          other: z.enum(['available', 'loaned']),
        }),
      ),
  },
})

describe('enumNames', () => {
  it('replaces every inline enum with that value set by a $ref', () => {
    const schemas = build(contract, {
      enumNames: { BookStatus: ['available', 'loaned', 'lost'] },
    })
    expect(schemas.BookStatus).toEqual({
      type: 'string',
      enum: ['available', 'loaned', 'lost'],
    })
    expect(schemas['book.find.Input']).toMatchObject({
      properties: { status: ref('BookStatus') },
    })
    expect(schemas['book.find.Output']).toMatchObject({
      properties: {
        status: { ...ref('BookStatus'), description: 'Where the book is' },
        other: { type: 'string', enum: ['available', 'loaned'] },
      },
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('leaves a component that is itself the enum, and reuses it', () => {
    const Status = z.enum(['a', 'b']).meta({ id: 'Status' })
    const schemas = build(
      router({
        get: procedure.output(
          z.object({ s: Status, inline: z.enum(['b', 'a']) }),
        ),
      }),
      { enumNames: { Status: ['a', 'b'] } },
    )
    expect(schemas.Status).toEqual({ type: 'string', enum: ['a', 'b'] })
    expect(schemas['get.Output']).toMatchObject({
      properties: { s: ref('Status'), inline: ref('Status') },
    })
  })

  it('warns about entries that matched nothing', () => {
    build(contract, { enumNames: { Missing: ['x'] } })
    expect(warn).toHaveBeenCalledWith(
      'openapi(): enumNames entries matched no inline enum: Missing.',
    )
  })

  it('throws on a name taken by another schema', () => {
    const Taken = z.object({ x: z.string() }).meta({ id: 'Taken' })
    expect(() =>
      build(
        router({
          get: procedure.output(z.object({ t: Taken, s: z.enum(['a', 'b']) })),
        }),
        { enumNames: { Taken: ['a', 'b'] } },
      ),
    ).toThrow(
      /enumNames "Taken" is already a component with a different schema/,
    )
  })

  it('throws on an invalid, empty, or duplicate entry', () => {
    expect(() =>
      build(contract, { enumNames: { 'Book Status': ['a'] } }),
    ).toThrow(/enumNames "Book Status" is not a valid component name/)
    expect(() => build(contract, { enumNames: { Empty: [] } })).toThrow(
      /enumNames "Empty" has no values/,
    )
    expect(() =>
      build(contract, { enumNames: { A: ['x', 'y'], B: ['y', 'x'] } }),
    ).toThrow(/enumNames "A" and "B" have the same values/)
  })

  it('is not set by the codegen profile', () => {
    const schemas = build(contract, { profile: 'codegen' })
    expect(schemas).not.toHaveProperty('BookStatus')
  })
})
