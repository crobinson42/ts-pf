import { describe, expect, it } from 'vitest'
import { withBase } from '../src/with-base.js'

describe('withBase', () => {
  it('joins a root base', () => {
    expect(withBase('/', '/rpc')).toBe('/rpc')
  })

  it('joins a base that already has a trailing slash', () => {
    expect(withBase('/docs/', '/rpc')).toBe('/docs/rpc')
  })

  it('joins a base without a trailing slash', () => {
    expect(withBase('/docs', '/rpc')).toBe('/docs/rpc')
  })

  it('adds a slash when the prefix omits it', () => {
    expect(withBase('/docs/', 'rpc')).toBe('/docs/rpc')
  })

  it('returns / when the join is empty', () => {
    expect(withBase('', '')).toBe('/')
    expect(withBase('/', '')).toBe('/')
  })

  it('does not strip a prefix that already includes the base', () => {
    expect(withBase('/docs/', '/docs/rpc')).toBe('/docs/docs/rpc')
  })
})
