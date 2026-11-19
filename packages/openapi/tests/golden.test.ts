import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { openapi } from '../src/openapi.js'
import { appContract } from './app-contract.js'
import { unresolvedRefs } from './resolve-refs.js'

const spec = openapi(catalog(appContract, { prefix: '/rpc' }), {
  info: { title: 'Library API', version: '1.0.0' },
})

describe('golden default output', () => {
  it('matches the committed document', async () => {
    await expect(`${JSON.stringify(spec, null, 2)}\n`).toMatchFileSnapshot(
      './fixtures/app-contract.openapi.json',
    )
  })

  it('resolves every internal $ref', () => {
    expect(unresolvedRefs(spec)).toEqual([])
  })

  it('leaves no $defs or nested $schema', () => {
    const dumped = JSON.stringify(spec)
    expect(dumped).not.toContain('"$defs"')
    expect(dumped).not.toContain('"definitions"')
    expect(dumped).not.toContain('"$schema"')
  })

  it('hoists shared ids and error codes into one component each', () => {
    const names = Object.keys(spec.components.schemas)
    expect(names).toEqual(
      expect.arrayContaining([
        'Genre',
        'Book',
        'BookInput',
        'Review',
        'Category',
        'PrintMedia',
        'AudioMedia',
        'Error.NOT_FOUND',
        'Error.NOT_FOUND.Data',
        'Error.FORBIDDEN',
        'book.create.Error.CONFLICT',
        'loan.create.Error.CONFLICT',
      ]),
    )
    expect(names).not.toContain('book.find.Error.NOT_FOUND')
    expect(names).not.toContain('GenreInput')
  })
})
