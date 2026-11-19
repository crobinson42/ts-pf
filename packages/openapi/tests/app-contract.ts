import { procedure, router } from '@ts-pf/contract'
import { docs } from '@ts-pf/docs'
import { stream } from '@ts-pf/stream'
import { z } from 'zod'

// A realistic library-catalog contract for the golden OpenAPI snapshot.
// It covers the shapes code generators trip over: shared `.meta({ id })`
// DTOs on both sides, discriminated unions of named variants, recursion
// (named and anonymous), shared and diverging error data, empty input,
// no output, and a stream.

const Genre = z.enum(['fiction', 'science', 'history']).meta({ id: 'Genre' })

const Address = z.object({
  street: z.string(),
  city: z.string(),
  geo: z.object({ lat: z.number(), lng: z.number() }),
})

// Input and output JSON Schema differ: `available` has a default.
const Book = z
  .object({
    isbn: z.string(),
    title: z.string(),
    genre: Genre,
    available: z.boolean().default(true),
    publisher: z.object({ name: z.string(), address: Address }),
  })
  .meta({ id: 'Book' })

const Author = z
  .object({ id: z.string(), name: z.string(), genres: z.array(Genre) })
  .meta({ id: 'Author' })

// Named recursion.
const Category: z.ZodType<{ name: string; children: unknown[] }> = z
  .object({
    name: z.string(),
    get children() {
      return z.array(Category)
    },
  })
  .meta({ id: 'Category' })

// Anonymous recursion inside a named DTO used by two procedures.
const Comment: z.ZodType<{ text: string; replies: unknown[] }> = z.object({
  text: z.string(),
  get replies() {
    return z.array(Comment)
  },
})

const Review = z
  .object({ bookIsbn: z.string(), rating: z.int(), thread: Comment })
  .meta({ id: 'Review' })

// Discriminated union of named variants.
const PrintMedia = z
  .object({ kind: z.literal('print'), pages: z.int() })
  .meta({ id: 'PrintMedia' })
const AudioMedia = z
  .object({ kind: z.literal('audio'), minutes: z.number() })
  .meta({ id: 'AudioMedia' })
const Media = z.discriminatedUnion('kind', [PrintMedia, AudioMedia])

const BookEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('added'), book: Book }).meta({ id: 'BookAdded' }),
  z
    .object({ type: z.literal('removed'), isbn: z.string() })
    .meta({ id: 'BookRemoved' }),
])

const notFound = {
  status: 404,
  message: 'Not found',
  data: z.object({ id: z.string() }),
} as const

const forbidden = { status: 403, message: 'Forbidden' } as const

export const appContract = router({
  book: {
    list: procedure
      .meta(docs({ summary: 'List books', tags: ['books'] }))
      .input(z.object({ genre: Genre.optional() }))
      .output(z.array(Book)),
    find: procedure
      .input(z.object({ isbn: z.string() }))
      .output(Book)
      .errors({ NOT_FOUND: notFound }),
    create: procedure
      .input(Book)
      .output(Book)
      .errors({
        CONFLICT: {
          status: 409,
          message: 'Duplicate ISBN',
          data: z.object({ isbn: z.string() }),
        },
        FORBIDDEN: forbidden,
      }),
    media: procedure.input(z.object({ isbn: z.string() })).output(Media),
    reviews: procedure
      .input(z.object({ isbn: z.string() }))
      .output(z.array(Review)),
    watch: procedure
      .input(z.object({ genre: Genre }))
      .output(stream(BookEvent)),
  },
  author: {
    find: procedure
      .input(z.object({ id: z.string() }))
      .output(Author)
      .errors({ NOT_FOUND: notFound }),
  },
  review: {
    find: procedure
      .input(z.object({ id: z.string() }))
      .output(Review)
      .errors({ NOT_FOUND: notFound }),
  },
  category: {
    tree: procedure.input(z.object({})).output(Category),
  },
  loan: {
    create: procedure
      .input(z.object({ isbn: z.string(), memberId: z.string() }))
      .output(z.object({ loanId: z.string(), dueAt: z.iso.datetime() }))
      .errors({
        CONFLICT: {
          status: 409,
          message: 'Already on loan',
          data: z.object({ isbn: z.string(), dueAt: z.iso.datetime() }),
        },
        FORBIDDEN: forbidden,
      }),
    return: procedure.input(z.object({ loanId: z.string() })),
  },
  health: procedure,
})
