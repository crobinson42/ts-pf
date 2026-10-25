import { procedure } from '@ts-pf/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { DOCS_KEY, type DocsMeta, docs, getDocs } from '../src/docs.js'

describe('docs()', () => {
  it('returns a meta fragment under the docs key', () => {
    expect(docs({ description: 'Find a planet by id' })).toEqual({
      docs: { description: 'Find a planet by id' },
    })
    expect(DOCS_KEY).toBe('docs')
  })

  it('composes with procedure.meta() and other meta keys', () => {
    const proc = procedure
      .meta(docs({ description: 'Find a planet by id' }))
      .meta({ auth: true })

    expect(proc['~pf'].meta).toEqual({
      docs: { description: 'Find a planet by id' },
      auth: true,
    })
    expect(getDocs(proc['~pf'].meta)).toEqual({
      description: 'Find a planet by id',
    })
  })

  it('getDocs returns undefined when docs is missing or not an object', () => {
    expect(getDocs({})).toBeUndefined()
    expect(getDocs({ docs: 'nope' })).toBeUndefined()
    expect(getDocs({ docs: null })).toBeUndefined()
  })

  it('types DocsMeta fields as optional', () => {
    const fragment = docs({
      description: 'x',
      summary: 'y',
      tags: ['planet'],
      deprecated: true,
      hidden: true,
    })
    expectTypeOf(fragment.docs.description).toEqualTypeOf<string | undefined>()
  })

  it('keeps tags and hidden literal, and leaves them out when not given', () => {
    const fragment = docs({ description: 'x', tags: ['planet'], hidden: true })
    expectTypeOf(fragment.docs.tags).toEqualTypeOf<['planet']>()
    expectTypeOf(fragment.docs.hidden).toEqualTypeOf<true>()
    expectTypeOf(docs({ summary: 'y' }).docs).not.toHaveProperty('tags')
    const wide: string[] = ['a']
    expectTypeOf(docs({ tags: wide }).docs.tags).toEqualTypeOf<string[]>()
    const meta: DocsMeta = fragment.docs
    expect(meta.tags).toEqual(['planet'])
    // @ts-expect-error unknown keys are still rejected
    docs({ descripton: 'typo' })
  })
})
