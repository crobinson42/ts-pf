import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { openapi } from '../src/openapi.js'
import { codegenAppContract } from './app-contract.js'
import { unresolvedRefs } from './resolve-refs.js'

const spec = openapi(catalog(codegenAppContract, { prefix: '/rpc' }), {
  info: { title: 'Library API', version: '1.0.0' },
  profile: 'codegen',
})

describe('golden codegen profile output', () => {
  it('matches the committed document', async () => {
    await expect(`${JSON.stringify(spec, null, 2)}\n`).toMatchFileSnapshot(
      './fixtures/app-contract.codegen.openapi.json',
    )
  })

  it('resolves every internal $ref', () => {
    expect(unresolvedRefs(spec)).toEqual([])
  })
})
