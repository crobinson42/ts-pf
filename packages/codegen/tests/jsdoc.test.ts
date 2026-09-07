import type { DocsMeta } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { jsDocLines } from '../src/jsdoc.js'

describe('jsDocLines', () => {
  it('prints description only', () => {
    expect(jsDocLines({ description: 'Find a planet by id' })).toEqual([
      '/**',
      ' * Find a planet by id',
      ' */',
    ])
  })

  it('prints summary only', () => {
    expect(jsDocLines({ summary: 'Find planet' })).toEqual([
      '/**',
      ' * Find planet',
      ' */',
    ])
  })

  it('prints summary then description when they differ', () => {
    expect(
      jsDocLines({
        summary: 'Find planet',
        description: 'Find a planet by id',
      }),
    ).toEqual(['/**', ' * Find planet', ' *', ' * Find a planet by id', ' */'])
  })

  it('prints equal summary and description once', () => {
    expect(
      jsDocLines({
        summary: 'Find a planet by id',
        description: 'Find a planet by id',
      }),
    ).toEqual(['/**', ' * Find a planet by id', ' */'])
  })

  it('prints deprecated only', () => {
    expect(jsDocLines({ deprecated: true })).toEqual([
      '/**',
      ' * @deprecated',
      ' */',
    ])
  })

  it('prints deprecated after a body', () => {
    expect(
      jsDocLines({ description: 'Find a planet by id', deprecated: true }),
    ).toEqual(['/**', ' * Find a planet by id', ' *', ' * @deprecated', ' */'])
  })

  it('ignores tags and hidden', () => {
    expect(
      jsDocLines({
        description: 'Find a planet by id',
        tags: ['planets'],
        hidden: true,
      }),
    ).toEqual(['/**', ' * Find a planet by id', ' */'])
    expect(jsDocLines({ tags: ['planets'], hidden: true })).toEqual([])
  })

  it('escapes */ in the body', () => {
    expect(jsDocLines({ description: 'Ends with */ still' })).toEqual([
      '/**',
      ' * Ends with *\\/ still',
      ' */',
    ])
  })

  it('keeps multiline description without reflow', () => {
    expect(jsDocLines({ description: 'Line one\n\nLine two' })).toEqual([
      '/**',
      ' * Line one',
      ' *',
      ' * Line two',
      ' */',
    ])
  })

  it('returns empty for missing, empty, or whitespace-only docs', () => {
    expect(jsDocLines(undefined)).toEqual([])
    expect(jsDocLines({})).toEqual([])
    expect(jsDocLines({ description: '' })).toEqual([])
    expect(jsDocLines({ description: '   \n  ' })).toEqual([])
    expect(jsDocLines({ summary: '  ' })).toEqual([])
  })

  it('skips non-string description and summary', () => {
    expect(jsDocLines({ description: 1 } as unknown as DocsMeta)).toEqual([])
    expect(
      jsDocLines({
        summary: true,
        deprecated: true,
      } as unknown as DocsMeta),
    ).toEqual(['/**', ' * @deprecated', ' */'])
  })
})
