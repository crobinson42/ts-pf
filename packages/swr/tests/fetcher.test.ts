import { describe, expect, it, vi } from 'vitest'
import { createFetcher } from '../src/fetcher.js'
import { generateSwrKey } from '../src/key.js'

describe('createFetcher', () => {
  it('calls a void procedure with no payload', async () => {
    const client = vi.fn(async () => [{ id: 1 }])
    const fetcher = createFetcher(client)
    await expect(fetcher(generateSwrKey(['planet', 'list']))).resolves.toEqual([
      { id: 1 },
    ])
    expect(client).toHaveBeenCalledWith()
  })

  it('reads input from the key so infinite queries can vary pages', async () => {
    const client = vi.fn(async (input: { cursor: number }) => ({
      cursor: input.cursor,
    }))
    const fetcher = createFetcher(client)
    await expect(
      fetcher(generateSwrKey(['planet', 'list'], undefined, { cursor: 2 })),
    ).resolves.toEqual({ cursor: 2 })
    expect(client).toHaveBeenCalledWith({ cursor: 2 })
  })

  it('throws through', async () => {
    const error = new Error('nope')
    const client = vi.fn(async () => {
      throw error
    })
    const fetcher = createFetcher(client)
    await expect(fetcher(generateSwrKey(['planet', 'list']))).rejects.toBe(
      error,
    )
  })
})
