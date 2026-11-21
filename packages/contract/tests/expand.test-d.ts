import {
  type ContractClient,
  type ContractProcedure,
  type Expansion,
  type InferContractProcedure,
  type InferExpandedOutput,
  procedure,
  router,
} from '@ts-pf/contract'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

const User = z.object({ id: z.string(), email: z.string() })
const Withheld = z.object({ id: z.string() })
const Category = z.object({ id: z.string(), name: z.string() })
const Ref = z.union([User, Withheld])
const Link = z.object({
  sortOrder: z.number(),
  doc: z.union([Category, Withheld]),
})

type User = z.output<typeof User>
type Withheld = z.output<typeof Withheld>
type Link = z.output<typeof Link>

// The wide output: what the server may send for any `populate`.
const PostWide = z.object({
  id: z.string(),
  title: z.string(),
  authorId: z.union([z.string(), Ref]),
  editorId: z.union([z.string(), Ref]).nullable().optional(),
  categories: z.array(Link).optional(),
})
type Post = {
  id: string
  title: string
  authorId: string
  editorId?: string | null
}

const Populate = z
  .array(z.enum(['authorId', 'editorId', 'categories']))
  .optional()

const contract = router({
  posts: {
    get: procedure
      .input(z.object({ id: z.string(), populate: Populate }))
      .output(PostWide)
      .expand({
        key: 'populate',
        fields: { authorId: Ref, editorId: Ref, categories: z.array(Link) },
      }),
    find: procedure
      .input(z.object({ limit: z.number().optional(), populate: Populate }))
      .output(z.object({ docs: z.array(PostWide), total: z.number() }))
      .expand({
        key: 'populate',
        at: ['docs'],
        fields: { authorId: Ref, editorId: Ref, categories: z.array(Link) },
      }),
    touch: procedure.input(z.object({ id: z.string() })).output(PostWide),
  },
})

declare const client: ContractClient<typeof contract>

describe('expand: builder contract', () => {
  it('no list gives the plain output', async () => {
    const post = await client.posts.get({ id: 'p' })
    expectTypeOf(post).toEqualTypeOf<Post>()
  })

  it('a literal list expands those fields only', async () => {
    const post = await client.posts.get({ id: 'p', populate: ['authorId'] })
    expectTypeOf(post.authorId).toEqualTypeOf<User | Withheld>()
    expectTypeOf(post.title).toEqualTypeOf<string>()
    expectTypeOf(post.editorId).toEqualTypeOf<string | null | undefined>()
    expectTypeOf(post).not.toHaveProperty('categories')
  })

  it('an optional / nullable ref stays optional / nullable', async () => {
    const post = await client.posts.get({ id: 'p', populate: ['editorId'] })
    expectTypeOf(post.editorId).toEqualTypeOf<
      User | Withheld | null | undefined
    >()
  })

  it('a field only present when expanded becomes required', async () => {
    const post = await client.posts.get({ id: 'p', populate: ['categories'] })
    expectTypeOf(post.categories).toEqualTypeOf<Link[]>()
  })

  it('`at` reaches through arrays', async () => {
    const plain = await client.posts.find({})
    expectTypeOf(plain.docs).toEqualTypeOf<Post[]>()
    expectTypeOf(plain.total).toEqualTypeOf<number>()
    const page = await client.posts.find({ populate: ['authorId'] })
    expectTypeOf(page.docs[0]?.authorId).toEqualTypeOf<
      User | Withheld | undefined
    >()
  })

  it('a non-literal list gives the wide output', async () => {
    const keys: ('authorId' | 'categories')[] = []
    const post = await client.posts.get({ id: 'p', populate: keys })
    expectTypeOf(post).toEqualTypeOf<z.output<typeof PostWide>>()
  })

  it('rejects a field that is not expandable', () => {
    // @ts-expect-error Type '"title"' is not assignable to type '"authorId" | "editorId" | "categories"'
    client.posts.get({ id: 'p', populate: ['title'] })
  })

  it('a procedure without expand keeps the plain signature', () => {
    expectTypeOf(client.posts.touch).parameters.toEqualTypeOf<
      [{ id: string }, ({ signal?: AbortSignal } | undefined)?]
    >()
  })

  it('InferContractProcedure reads the expansion', () => {
    expectTypeOf<
      InferContractProcedure<typeof contract.posts.find>['expand']
    >().toEqualTypeOf<
      Expansion<
        'populate',
        readonly ['docs'],
        {
          authorId: User | Withheld
          editorId: User | Withheld
          categories: Link[]
        }
      >
    >()
    expectTypeOf<
      InferContractProcedure<typeof contract.posts.touch>['expand']
    >().toBeNever()
  })

  it('InferExpandedOutput matches what the call returns', () => {
    expectTypeOf<
      InferExpandedOutput<typeof contract.posts.get>
    >().toEqualTypeOf<Post>()
    expectTypeOf<
      InferExpandedOutput<typeof contract.posts.get, ['authorId']>['authorId']
    >().toEqualTypeOf<User | Withheld>()
    expectTypeOf<
      InferExpandedOutput<typeof contract.posts.touch>
    >().toEqualTypeOf<z.output<typeof PostWide>>()
    // @ts-expect-error 'title' is not an expandable field
    type _Bad = InferExpandedOutput<typeof contract.posts.get, ['title']>
  })
})

describe('expand: builder checks', () => {
  const input = z.object({ id: z.string(), populate: Populate })

  it('needs the input to declare the list', () => {
    procedure
      .input(z.object({ id: z.string() }))
      .output(PostWide)
      // @ts-expect-error expand: the input has no "populate" field
      .expand({ key: 'populate', fields: { authorId: Ref } })
  })

  it('needs the list to accept every field name', () => {
    procedure
      .input(z.object({ populate: z.array(z.enum(['authorId'])).optional() }))
      .output(PostWide)
      // @ts-expect-error expand: input field "populate" must accept an array of the expandable field names
      .expand({ key: 'populate', fields: { authorId: Ref, editorId: Ref } })
  })

  it('needs `at` to reach an object', () => {
    procedure
      .input(input)
      .output(z.object({ docs: z.array(PostWide) }))
      // @ts-expect-error expand: the output has no object at "items"
      .expand({ key: 'populate', at: ['items'], fields: { authorId: Ref } })
  })

  it('needs each expanded type to fit the wide output field', () => {
    procedure
      .input(input)
      .output(PostWide)
      // @ts-expect-error expand: field "title" is not in the output, or …
      .expand({ key: 'populate', fields: { authorId: Ref, title: Ref } })
    procedure
      .input(input)
      .output(z.object({ authorId: z.string() }))
      // @ts-expect-error expand: field "authorId" … does not accept its expanded type
      .expand({ key: 'populate', fields: { authorId: Ref } })
  })
})

describe('expand: hand-written contract type', () => {
  type GetInput = {
    id: string
    populate?: ('authorId' | 'categories')[] | undefined
  }
  type Wide = {
    id: string
    authorId: string | User | Withheld
    categories?: Link[]
  }
  type Page = { docs: Wide[]; total: number }
  type Fields = { authorId: User | Withheld; categories: Link[] }

  type Contract = {
    posts: {
      get: ContractProcedure<
        GetInput,
        Wide,
        {},
        {},
        GetInput,
        Expansion<'populate', [], Fields>
      >
      find: ContractProcedure<
        GetInput,
        Page,
        {},
        {},
        GetInput,
        Expansion<'populate', ['docs'], Fields>
      >
    }
  }
  const hand = {} as ContractClient<Contract>

  it('narrows like a builder contract', async () => {
    const plain = await hand.posts.get({ id: 'p' })
    expectTypeOf(plain).toEqualTypeOf<{ id: string; authorId: string }>()
    const post = await hand.posts.get({
      id: 'p',
      populate: ['authorId', 'categories'],
    })
    expectTypeOf(post.authorId).toEqualTypeOf<User | Withheld>()
    expectTypeOf(post.categories).toEqualTypeOf<Link[]>()
    const page = await hand.posts.find({ id: 'p', populate: ['categories'] })
    expectTypeOf(page.docs).toEqualTypeOf<
      { id: string; authorId: string; categories: Link[] }[]
    >()
  })

  it('InferExpandedOutput reads it', () => {
    expectTypeOf<
      InferExpandedOutput<Contract['posts']['get'], ['authorId']>
    >().toEqualTypeOf<{ id: string; authorId: User | Withheld }>()
  })
})
