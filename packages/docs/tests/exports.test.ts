import type {
  CatalogProcedure,
  DocsMeta,
  JsonSchemaConverter,
  ProcedureCatalog,
} from '@ts-pf/docs'
import {
  catalog,
  DOCS_KEY,
  docs,
  getDocs,
  registerJsonSchemaConverter,
  toJsonSchema,
  walkContract,
} from '@ts-pf/docs'
import { describe, expect, expectTypeOf, it } from 'vitest'

describe('public exports', () => {
  it('exports the catalog API', () => {
    expect(typeof catalog).toBe('function')
    expect(typeof docs).toBe('function')
    expect(typeof getDocs).toBe('function')
    expect(typeof walkContract).toBe('function')
    expect(typeof toJsonSchema).toBe('function')
    expect(typeof registerJsonSchemaConverter).toBe('function')
    expect(DOCS_KEY).toBe('docs')
    expectTypeOf<DocsMeta>({})
    expectTypeOf<ProcedureCatalog['catalogVersion']>(1)
    expectTypeOf<CatalogProcedure['key']>('')
    expectTypeOf<JsonSchemaConverter['vendor']>('')
  })
})
