import { describe, expect, it, vi } from 'vitest'
import {
  bm25Search,
  denseSearch,
  type Embed,
  hybridSearch,
  type SearchContext,
} from '../src/index.js'
import { createSearchIndex, tokenize } from '../src/search.js'
import { toyEmbed } from './embed.js'

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

const docs = [
  { id: 'billing_refund', text: 'billing_refund Refund an invoice' },
  { id: 'user_remove', text: 'user_remove Delete a user permanently' },
  { id: 'user_find', text: 'user_find Find a user by id' },
]
const ctx = (report: SearchContext['report'] = () => {}): SearchContext => ({
  report,
})

describe('bm25Search', () => {
  it('is the keyword index', () => {
    const index = bm25Search()(docs)
    expect(index.search('refund', ctx())).toEqual(['billing_refund'])
    expect(index.search('erase account', ctx())).toEqual([])
  })
})

describe('denseSearch', () => {
  it('finds tools by meaning, best first, above minScore', async () => {
    expect(
      await denseSearch({ embed: toyEmbed })(docs).search(
        'erase account',
        ctx(),
      ),
    ).toEqual(['user_remove', 'user_find'])
    expect(
      await denseSearch({ embed: toyEmbed, minScore: 0.8 })(docs).search(
        'erase account',
        ctx(),
      ),
    ).toEqual(['user_remove'])
  })

  it('embeds tools once, lazily, and passes kind and signal', async () => {
    const embed = vi.fn(toyEmbed)
    const index = denseSearch({ embed })(docs)
    expect(embed).not.toHaveBeenCalled()
    const signal = new AbortController().signal
    await index.search('erase account', { signal, report: () => {} })
    await index.search('locate person', ctx())
    const kinds = embed.mock.calls.map(([texts, options]) => [
      texts.length,
      options,
    ])
    expect(kinds).toEqual([
      [3, { kind: 'document' }],
      [1, { kind: 'query', signal }],
      [1, { kind: 'query' }],
    ])
  })

  it('retries tool embedding after a failure', async () => {
    let fail = true
    const embed: Embed = (texts, options) => {
      if (fail && options.kind === 'document') throw new Error('model down')
      return toyEmbed(texts, options)
    }
    const index = denseSearch({ embed })(docs)
    await expect(index.search('erase account', ctx())).rejects.toThrow(
      'model down',
    )
    fail = false
    expect(await index.search('erase account', ctx())).toEqual([
      'user_remove',
      'user_find',
    ])
  })

  it('rejects vectors of the wrong count or length', async () => {
    const short: Embed = (texts, { kind }) =>
      (kind === 'document' ? texts.slice(1) : texts).map(() => [1, 0])
    await expect(
      denseSearch({ embed: short })(docs).search('x', ctx()),
    ).rejects.toThrow('embed() returned 2 vectors for 3 texts')
    const mixed: Embed = (texts, { kind }) =>
      texts.map(() => (kind === 'query' ? [1, 0, 0] : [1, 0]))
    await expect(
      denseSearch({ embed: mixed })(docs).search('x', ctx()),
    ).rejects.toThrow('query vector whose length differs')
  })
})

describe('hybridSearch', () => {
  it('keeps keyword hits and adds meaning hits', async () => {
    const index = hybridSearch({ embed: toyEmbed })(docs)
    // Shares no words with any tool: dense alone finds them.
    expect(await index.search('erase account', ctx())).toEqual([
      'user_remove',
      'user_find',
    ])
    // No meaning axis: BM25 alone finds it.
    expect(await index.search('invoice', ctx())).toEqual(['billing_refund'])
    // Both agree on the top hit.
    expect((await index.search('remove account', ctx()))[0]).toBe('user_remove')
  })

  it('falls back to BM25 and reports when embed fails', async () => {
    const failure = new Error('model down')
    const report = vi.fn()
    const index = hybridSearch({
      embed: () => Promise.reject(failure),
    })(docs)
    expect(await index.search('refund', ctx(report))).toEqual([
      'billing_refund',
    ])
    expect(report).toHaveBeenCalledWith(failure)
  })
})
