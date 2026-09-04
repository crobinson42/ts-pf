import { describe, expect, it } from 'vitest'
import { generateSwrKey, inputFromKey } from '../src/key.js'

describe('generateSwrKey', () => {
  it('omits input when it is undefined', () => {
    expect(generateSwrKey(['planet', 'list'])).toEqual([['planet', 'list'], {}])
  })

  it('includes input when present', () => {
    expect(generateSwrKey(['planet', 'find'], undefined, { id: 1 })).toEqual([
      ['planet', 'find'],
      { input: { id: 1 } },
    ])
  })

  it('prepends prefix when present', () => {
    expect(generateSwrKey(['planet', 'find'], 'user', { id: 1 })).toEqual([
      'user',
      ['planet', 'find'],
      { input: { id: 1 } },
    ])
  })

  it('reads input from the last key element', () => {
    const key = generateSwrKey(['planet', 'find'], 'user', { id: 2 })
    expect(inputFromKey(key)).toEqual({ id: 2 })
    expect(inputFromKey(generateSwrKey(['planet', 'list']))).toBeUndefined()
  })
})
