import { describe, expect, it, vi } from 'vitest'
import { generateSwrKey } from '../src/key.js'
import { createMutator } from '../src/mutator.js'

describe('createMutator', () => {
  it('calls the procedure with trigger arg, not the revalidation key', async () => {
    const client = vi.fn(async (input: { name: string }) => ({
      id: 3,
      name: input.name,
    }))
    const mutator = createMutator(client)
    const listKey = generateSwrKey(['planet', 'list'])
    await expect(mutator(listKey, { arg: { name: 'Venus' } })).resolves.toEqual(
      { id: 3, name: 'Venus' },
    )
    expect(client).toHaveBeenCalledWith({ name: 'Venus' })
  })
})
