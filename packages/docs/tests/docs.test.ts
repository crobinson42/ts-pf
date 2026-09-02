import { procedure } from '@ts-pf/contract'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { DOCS_KEY, docs, getDocs } from '../src/docs.js'

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
})
