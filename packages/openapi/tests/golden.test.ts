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
})
