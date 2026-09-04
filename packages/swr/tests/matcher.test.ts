import { describe, expect, it } from 'vitest'
import { generateSwrKey } from '../src/key.js'
import { createMatcher, isSubsetOf } from '../src/matcher.js'

describe('isSubsetOf', () => {
  it('matches equal values and nested objects', () => {
    expect(isSubsetOf({ id: 1 }, { id: 1, extra: true })).toBe(true)
    expect(isSubsetOf({ id: 2 }, { id: 1 })).toBe(false)
    expect(isSubsetOf(['planet'], ['planet', 'find'])).toBe(true)
    expect(isSubsetOf(['planet', 'find'], ['planet'])).toBe(false)
  })
})

describe('createMatcher', () => {
  const findKey = generateSwrKey(['planet', 'find'], undefined, { id: 1 })
  const listKey = generateSwrKey(['planet', 'list'])
  const otherFind = generateSwrKey(['planet', 'find'], undefined, { id: 2 })
  const prefixed = generateSwrKey(['planet', 'find'], 'user', { id: 1 })

  it('matches a router prefix', () => {
    const match = createMatcher(['planet'])
    expect(match(findKey)).toBe(true)
    expect(match(listKey)).toBe(true)
    expect(match(generateSwrKey(['ship', 'list']))).toBe(false)
  })

  it('matches all keys at the root', () => {
    const match = createMatcher([])
    expect(match(findKey)).toBe(true)
    expect(match(listKey)).toBe(true)
    expect(match(prefixed)).toBe(false)
  })

  it('matches input as a nested subset', () => {
    const match = createMatcher(['planet', 'find'], undefined, { id: 1 })
    expect(match(findKey)).toBe(true)
    expect(match(otherFind)).toBe(false)
    expect(match(listKey)).toBe(false)
  })

  it('requires a two-way match for exact strategy', () => {
    const partial = createMatcher(['planet'])
    const exact = createMatcher(['planet'], undefined, undefined, 'exact')
    expect(partial(findKey)).toBe(true)
    expect(exact(findKey)).toBe(false)
    expect(exact(generateSwrKey(['planet']))).toBe(true)
  })

  it('isolates prefixes', () => {
    const user = createMatcher(['planet', 'find'], 'user', { id: 1 })
    const post = createMatcher(['planet', 'find'], 'post', { id: 1 })
    expect(user(prefixed)).toBe(true)
    expect(user(findKey)).toBe(false)
    expect(post(prefixed)).toBe(false)
  })
})
