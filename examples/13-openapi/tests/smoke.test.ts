import { catalog } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'
import { describe, expect, it } from 'vitest'
import { contract } from '../src/contract.js'

describe('13-openapi', () => {
  const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
    info: { title: 'Planet API', version: '1.0.0' },
  })

  it('projects POST JSON RPC paths from the catalog', () => {
    expect(Object.keys(spec.paths)).toEqual([
      '/rpc/planet/list',
      '/rpc/planet/find',
      '/rpc/planet/create',
      '/rpc/planet/chat',
    ])
    for (const item of Object.values(spec.paths)) {
      expect(item.post).toBeDefined()
      expect(item).not.toHaveProperty('get')
    }
    expect(spec.paths).not.toHaveProperty('/rpc/planet/hidden')
    expect(
      spec.paths['/rpc/planet/find']?.post?.requestBody?.content,
    ).toHaveProperty('application/json')
    expect(
      spec.paths['/rpc/planet/chat']?.post?.responses['200']?.content,
    ).toHaveProperty('application/jsonl')
    expect(spec.components.parameters?.TsPfProtocol).toMatchObject({
      name: 'x-ts-pf-protocol',
      in: 'header',
    })
  })

  it('round-trips through JSON', () => {
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec)
  })
})
