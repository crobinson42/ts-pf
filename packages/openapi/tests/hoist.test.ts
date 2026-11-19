import { procedure, router } from '@ts-pf/contract'
import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { openapi } from '../src/openapi.js'
import { unresolvedRefs } from './resolve-refs.js'

function build(contract: unknown) {
  const spec = openapi(catalog(contract), {
    info: { title: 'Library API', version: '1' },
  })
  expect(unresolvedRefs(spec)).toEqual([])
  return spec.components.schemas
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

describe('hoisted $defs', () => {
  it('shares one component per id and keeps per-procedure aliases', () => {
    const Author = z
      .object({ id: z.string(), name: z.string() })
      .meta({ id: 'Author' })
    const schemas = build(
      router({
        find: procedure.input(z.object({ id: z.string() })).output(Author),
        list: procedure.output(z.array(Author)),
      }),
    )
    expect(schemas.Author).toEqual({
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
      required: ['id', 'name'],
    })
    expect(schemas['find.Output']).toEqual(ref('Author'))
    expect(schemas['list.Output']).toEqual({
      type: 'array',
      items: ref('Author'),
    })
    expect(JSON.stringify(schemas)).not.toContain('$defs')
  })

  it('names the input shape <id>Input when it differs from the output', () => {
    const Genre = z.enum(['fiction', 'science']).meta({ id: 'Genre' })
    const Book = z
      .object({ title: z.string(), genre: Genre, copies: z.int().default(1) })
      .meta({ id: 'Book' })
    // Shelf's own fields match on both sides; it splits because Book does.
    const Shelf = z
      .object({ label: z.string(), books: z.array(Book) })
      .meta({ id: 'Shelf' })
    const schemas = build(
      router({ shelf: { save: procedure.input(Shelf).output(Shelf) } }),
    )
    expect(schemas['shelf.save.Input']).toEqual(ref('ShelfInput'))
    expect(schemas['shelf.save.Output']).toEqual(ref('Shelf'))
    expect(schemas.ShelfInput).toMatchObject({
      properties: { books: { items: ref('BookInput') } },
    })
    expect(schemas.Shelf).toMatchObject({
      properties: { books: { items: ref('Book') } },
    })
    expect(schemas.Book).toMatchObject({
      required: ['title', 'genre', 'copies'],
    })
    expect(schemas.BookInput).toMatchObject({ required: ['title', 'genre'] })
    // Genre is the same on both sides.
    expect(schemas).not.toHaveProperty('GenreInput')
    expect(schemas.Genre).toEqual({
      type: 'string',
      enum: ['fiction', 'science'],
    })
  })

  it('splits a closed object used on both sides (inputs stay closed)', () => {
    const Tag = z.strictObject({ name: z.string() }).meta({ id: 'Tag' })
    const schemas = build(router({ save: procedure.input(Tag).output(Tag) }))
    expect(schemas.TagInput).toHaveProperty('additionalProperties', false)
    expect(schemas.Tag).not.toHaveProperty('additionalProperties')
  })

  it('throws when one id has two shapes on the same side', () => {
    const a = z.object({ id: z.string() }).meta({ id: 'Item' })
    const b = z.object({ id: z.number() }).meta({ id: 'Item' })
    expect(() =>
      build(router({ one: procedure.output(a), two: procedure.output(b) })),
    ).toThrow(
      /schema id "Item" has two different output shapes \(one, two\).*distinct \.meta\(\{ id \}\)/,
    )
  })

  it('throws when <id>Input is already an id', () => {
    const Book = z.object({ copies: z.int().default(1) }).meta({ id: 'Book' })
    const BookInput = z.object({ title: z.string() }).meta({ id: 'BookInput' })
    expect(() =>
      build(
        router({
          save: procedure.input(Book).output(Book),
          other: procedure.output(BookInput),
        }),
      ),
    ).toThrow(/"BookInput" is already an id/)
  })

  it('throws when an id collides with another component name', () => {
    const Clash = z.object({ id: z.string() }).meta({ id: 'Error.NOT_FOUND' })
    expect(() =>
      build(
        router({
          find: procedure.output(Clash).errors({ NOT_FOUND: { status: 404 } }),
        }),
      ),
    ).toThrow(/component "Error\.NOT_FOUND" would be written twice/)
  })

  it('sanitizes ids into valid component names', () => {
    const Book = z.object({ title: z.string() }).meta({ id: 'lib/Book v2' })
    const schemas = build(router({ find: procedure.output(Book) }))
    expect(schemas['find.Output']).toEqual(ref('lib_Book_v2'))
    expect(schemas).toHaveProperty('lib_Book_v2')
  })

  it('keeps generated defs per host, sharing identical ones', () => {
    const Thread: z.ZodType<{ text: string; replies: unknown[] }> = z.object({
      text: z.string(),
      get replies() {
        return z.array(Thread)
      },
    })
    const Folder: z.ZodType<{ name: string; folders: unknown[] }> = z.object({
      name: z.string(),
      get folders() {
        return z.array(Folder)
      },
    })
    const Review = z
      .object({ rating: z.int(), thread: Thread })
      .meta({ id: 'Review' })
    const schemas = build(
      router({
        a: procedure.output(z.object({ review: Review, folder: Folder })),
        b: procedure.output(z.object({ review: Review, thread: Thread })),
      }),
    )
    const generated = Object.keys(schemas).filter((name) =>
      name.includes('__schema'),
    )
    // Thread (inside Review, and at b's root) is one component; Folder has
    // its own. Each is named after a host that uses it.
    expect(generated).toHaveLength(2)
    const review = schemas.Review as { properties: { thread: unknown } }
    const thread = review.properties.thread as { $ref: string }
    expect(schemas['b.Output']).toMatchObject({
      properties: { thread: { $ref: thread.$ref } },
    })
    expect(thread.$ref).toMatch(
      /^#\/components\/schemas\/[ab]\.Output\.__schema\d$/,
    )
  })
})

describe('error components', () => {
  it('shares one component per code when every data shape matches', () => {
    const notFound = { status: 404, data: z.object({ id: z.string() }) }
    const forbidden = { status: 403 }
    const spec = openapi(
      catalog(
        router({
          a: procedure.errors({ NOT_FOUND: notFound, FORBIDDEN: forbidden }),
          b: procedure.errors({
            NOT_FOUND: { ...notFound, message: 'No such b' },
            FORBIDDEN: forbidden,
          }),
        }),
      ),
      { info: { title: 'Library API', version: '1' } },
    )
    const schemas = spec.components.schemas
    expect(Object.keys(schemas).filter((n) => n.startsWith('Error.'))).toEqual([
      'Error.NOT_FOUND.Data',
      'Error.NOT_FOUND',
      'Error.FORBIDDEN',
    ])
    for (const path of ['/a', '/b']) {
      const responses = spec.paths[path]?.post?.responses
      expect(responses?.['404']?.content?.['application/json']?.schema).toEqual(
        ref('Error.NOT_FOUND'),
      )
    }
    // The response keeps the procedure's own message.
    expect(spec.paths['/b']?.post?.responses['404']?.description).toBe(
      'No such b',
    )
  })

  it('keeps per-procedure components when data differs (or is missing)', () => {
    const schemas = build(
      router({
        a: procedure.errors({
          CONFLICT: { status: 409, data: z.object({ isbn: z.string() }) },
        }),
        b: procedure.errors({
          CONFLICT: { status: 409, data: z.object({ loanId: z.string() }) },
        }),
        c: procedure.errors({ CONFLICT: { status: 409 } }),
      }),
    )
    expect(schemas).not.toHaveProperty('Error.CONFLICT')
    expect(schemas).toHaveProperty('a.Error.CONFLICT.Data')
    expect(schemas).toHaveProperty('b.Error.CONFLICT.Data')
    expect(schemas).toHaveProperty('c.Error.CONFLICT')
    expect(schemas).not.toHaveProperty('c.Error.CONFLICT.Data')
  })

  it('opens error data and keeps the protocol envelope closed', () => {
    const schemas = build(
      router({
        a: procedure.errors({
          GONE: { status: 410, data: z.object({ id: z.string() }) },
        }),
      }),
    )
    expect(schemas['Error.GONE.Data']).not.toHaveProperty(
      'additionalProperties',
    )
    expect(schemas['Error.GONE']).toHaveProperty('additionalProperties', false)
    expect(schemas['TsPf.Error.VALIDATION.Data']).not.toHaveProperty(
      'additionalProperties',
    )
  })
})
