import { describe, expect, it } from 'vitest'
import { createSearchIndex, tokenize } from '../src/search.js'

describe('tokenize', () => {
  it('splits snake_case, camelCase, and punctuation', () => {
    expect(tokenize('user_listActive: Find-them')).toEqual([
      'user',
      'list',
      'active',
      'find',
      'them',
    ])
  })
})

describe('createSearchIndex', () => {
  const index = createSearchIndex([
    { id: 'audit_search', text: 'audit_search Search the audit log by actor' },
    { id: 'billing_refund', text: 'billing_refund Refund an invoice' },
    { id: 'billing_invoice', text: 'billing_invoice Get an invoice by id' },
  ])

  it('ranks matching documents and drops non-matches', () => {
    expect(index.search('refund invoice')).toEqual([
      'billing_refund',
      'billing_invoice',
    ])
    expect(index.search('audit')).toEqual(['audit_search'])
    expect(index.search('weather')).toEqual([])
  })
})
