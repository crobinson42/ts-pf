import { catalog } from '@ts-pf/docs'
import { describe, expect, it, vi } from 'vitest'
import { openapi } from '../src/openapi.js'
import { codegenAppContract } from './app-contract.js'
import { unresolvedRefs } from './resolve-refs.js'

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
const spec = openapi(catalog(codegenAppContract, { prefix: '/rpc' }), {
  info: { title: 'Library API', version: '1.0.0' },
  profile: 'codegen',
})
const warnings = warn.mock.calls.map(([message]) => message)
warn.mockRestore()

describe('golden codegen profile output', () => {
  it('matches the committed document', async () => {
    await expect(`${JSON.stringify(spec, null, 2)}\n`).toMatchFileSnapshot(
      './fixtures/app-contract.codegen.openapi.json',
    )
  })

  it('resolves every internal $ref', () => {
    expect(unresolvedRefs(spec)).toEqual([])
  })

  it('warns once about the hoisted object names', () => {
    expect(warnings).toEqual([
      "openapi(): hoist 'objects' named 7 inline object(s): BookInputPublisher, BookInputPublisherAddress, BookInputPublisherAddressGeo, BookPublisher, BookPublisherAddress, BookPublisherAddressGeo, ValidationErrorDataIssuesItem. Give each a .meta({ id }) for a name you choose.",
    ])
  })

  it('infers discriminators for the tagged unions', () => {
    const { schemas } = spec.components
    expect(schemas.BookMediaOutput).toHaveProperty(
      'discriminator.propertyName',
      'kind',
    )
    expect(schemas.BookWatchOutput).toHaveProperty(
      'discriminator.propertyName',
      'type',
    )
  })
})
