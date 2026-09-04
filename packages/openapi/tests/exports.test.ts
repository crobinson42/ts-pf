import {
  type OpenAPIDocument,
  type OpenAPIOptions,
  openapi,
} from '@ts-pf/openapi'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('public exports', () => {
  it('exports openapi and document types', () => {
    expect(typeof openapi).toBe('function')
    expectTypeOf<OpenAPIDocument['openapi']>('3.1.0')
    expectTypeOf<OpenAPIOptions['info']['title']>('')
  })
})
