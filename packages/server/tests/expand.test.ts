import { procedure, router } from '@ts-pf/contract'
import { createImplementer, createLocalClient } from '@ts-pf/server'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

const User = z.object({ id: z.string(), name: z.string() })
const Post = z.object({ id: z.string(), authorId: z.union([z.string(), User]) })

const contract = router({
  posts: {
    get: procedure
      .input(
        z.object({
          id: z.string(),
          populate: z.array(z.enum(['authorId'])).optional(),
        }),
      )
      .output(Post)
      .expand({ key: 'populate', fields: { authorId: User } }),
  },
})

const impl = createImplementer(contract)
// The handler returns the wide output; the list arrives as a plain input field.
const app = impl.router({
  posts: {
    get: impl.posts.get.handler(({ input }) => {
      expectTypeOf(input.populate).toEqualTypeOf<'authorId'[] | undefined>()
      return {
        id: input.id,
        authorId: input.populate?.includes('authorId')
          ? { id: 'u1', name: 'Ada' }
          : 'u1',
      }
    }),
  },
})

describe('expand through createLocalClient', () => {
  const client = createLocalClient(app, { context: {} })

  it('narrows per call and passes the list to the handler', async () => {
    const plain = await client.posts.get({ id: 'p1' })
    expectTypeOf(plain.authorId).toEqualTypeOf<string>()
    expect(plain.authorId).toBe('u1')

    const post = await client.posts.get({ id: 'p1', populate: ['authorId'] })
    expectTypeOf(post.authorId).toEqualTypeOf<{ id: string; name: string }>()
    expect(post.authorId).toEqual({ id: 'u1', name: 'Ada' })
  })

  it('output validation checks the wide schema', async () => {
    const checked = createLocalClient(app, {
      context: {},
      validation: { output: true },
    })
    await expect(
      checked.posts.get({ id: 'p1', populate: ['authorId'] }),
    ).resolves.toEqual({ id: 'p1', authorId: { id: 'u1', name: 'Ada' } })
  })
})
