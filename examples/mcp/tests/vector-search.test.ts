import type { Embed, McpTools } from '@ts-pf/mcp'
import { describe, expect, it, vi } from 'vitest'
import { vectorSearchTools } from '../src/host-vector-search.js'
import { tools } from '../src/mcp.js'

/** A stand-in for a real model: synonyms share an axis. */
const AXES: Record<string, number> = {
  delete: 0,
  remove: 0,
  destroy: 0,
  planet: 1,
  world: 1,
  rename: 2,
  name: 2,
}
const toyEmbed: Embed = (texts) =>
  texts.map((text) => {
    const vector = [0, 0, 0]
    for (const word of text.toLowerCase().split(/[^a-z]+/)) {
      const axis = AXES[word]
      if (axis !== undefined) vector[axis] = (vector[axis] ?? 0) + 1
    }
    return vector
  })

async function discover(bound: McpTools, query: string): Promise<string[]> {
  const result = await bound.call('get_planets_operations_capabilities', {
    query,
    detail: 'name',
  })
  const first = result.content[0]
  const body = JSON.parse(first?.type === 'text' ? first.text : '{}')
  return body.tools.map((t: { name: string }) => t.name)
}

describe('host vector search', () => {
  it('BM25 (the default) finds nothing without a shared word', async () => {
    expect(await discover(tools, 'destroy world')).toEqual([])
  })

  it('hybridSearch finds the tool by meaning, best first', async () => {
    const embed = vi.fn(toyEmbed)
    const vector = vectorSearchTools(embed)
    expect(await discover(vector, 'destroy world')).toEqual([
      'planet_remove',
      'planet_rename',
    ])
    // Exact words still rank.
    expect((await discover(vector, 'rename'))[0]).toBe('planet_rename')
    // Tool vectors are embedded once, on the first query.
    const documentCalls = embed.mock.calls.filter(
      ([, options]) => options.kind === 'document',
    )
    expect(documentCalls).toHaveLength(1)
  })
})
