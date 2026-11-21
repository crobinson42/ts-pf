import { emit, emitFiles } from '@ts-pf/codegen'
import { procedure, router } from '@ts-pf/contract'
import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { typecheckDtsDir } from './typecheck-dts.js'

const User = z.object({ id: z.string(), email: z.string() })
const Withheld = z.object({ id: z.string() })
const Ref = z.union([User, Withheld])
const Link = z.object({ sortOrder: z.number(), doc: Ref })
const PostWide = z.object({
  id: z.string(),
  authorId: z.union([z.string(), Ref]),
  categories: z.array(Link).optional(),
})
const Populate = z.array(z.enum(['authorId', 'categories'])).optional()

const contract = router({
  posts: {
    get: procedure
      .input(z.object({ id: z.string(), populate: Populate }))
      .output(PostWide)
      .expand({
        key: 'populate',
        fields: { authorId: Ref, categories: z.array(Link) },
      }),
    find: procedure
      .input(z.object({ populate: Populate }))
      .output(z.object({ docs: z.array(PostWide) }))
      .errors({ NOT_FOUND: { status: 404 } })
      .expand({
        key: 'populate',
        at: ['docs'],
        fields: { authorId: Ref, categories: z.array(Link) },
      }),
    touch: procedure.input(z.object({ id: z.string() })),
  },
})

// Exercised against both emit() and emitFiles(): the generated contract must
// narrow like the builder contract it came from.
const consumer = (
  from: string,
) => `import { createClient, type Link } from '@ts-pf/client'
import type { Contract } from '${from}'

const link: Link = {
  call: () => Promise.reject(new Error('not called')) as ReturnType<Link['call']>,
}
const client = createClient<Contract>(link)

export async function check(): Promise<string> {
  const plain = await client.posts.get({ id: 'p' })
  const id: string = plain.authorId
  // @ts-expect-error not populated: no categories key
  plain.categories
  const post = await client.posts.get({ id: 'p', populate: ['authorId', 'categories'] })
  const author: { id: string } = post.authorId
  const sort: number | undefined = post.categories[0]?.sortOrder
  const page = await client.posts.find({ populate: ['authorId'] })
  const first: { id: string } | undefined = page.docs[0]?.authorId
  // @ts-expect-error not an expandable field
  await client.posts.get({ id: 'p', populate: ['id'] })
  await client.posts.touch({ id: 'p' })
  return id + author.id + String(sort) + String(first?.id)
}
`

describe('codegen: expand', () => {
  const spec = catalog(contract)

  it('prints the Expansion argument, naming the input once', () => {
    const dts = emit(spec)
    expect(dts).toContain(
      "import type { ContractProcedure, Expansion } from '@ts-pf/contract'",
    )
    expect(dts).toContain("Expansion<'populate', ['docs'], {")
    expect(dts).toContain("Expansion<'populate', [], {")
    expect(dts).toContain('type PostsGetInput = ')
  })

  it('keeps the plain import without an expansion', () => {
    const plain = catalog(router({ ping: procedure.output(z.string()) }))
    expect(emit(plain)).toContain(
      "import type { ContractProcedure } from '@ts-pf/contract'",
    )
  })

  it('emit() typechecks and narrows per call', () => {
    const files = new Map([
      ['contract.d.ts', emit(spec)],
      ['consumer.ts', consumer('./contract.js')],
    ])
    expect(typecheckDtsDir(files, 'consumer.ts')).toEqual([])
  })

  it('emitFiles() typechecks and narrows per call', () => {
    const files = new Map(
      emitFiles(spec).map((file) => [file.path, file.contents]),
    )
    expect(files.get('posts.find.d.ts')).toContain(
      "Expansion<'populate', ['docs'], {",
    )
    files.set('consumer.ts', consumer('./contract.js'))
    expect(typecheckDtsDir(files, 'consumer.ts')).toEqual([])
  })
})
