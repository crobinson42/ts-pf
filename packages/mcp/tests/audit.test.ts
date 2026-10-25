import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { all, audit, createToolkit } from '../src/index.js'
import { type Ctx, contract } from './fixture.js'

const tk = createToolkit(contract).$context<Ctx>()

describe('audit', () => {
  it('passes a described, classified toolset', () => {
    expect(
      audit([tk.$toolset({ tools: all(tk.user, { effect: 'read' }) })]),
    ).toEqual([])
  })

  it('reports missing descriptions, unclassified tools, and schema roots', () => {
    const findings = audit([
      tk.$toolset({ tools: [all(tk.legacy), all(tk.internal)] }),
    ])
    expect(findings).toEqual([
      {
        level: 'error',
        tool: 'legacy_report',
        message:
          'no description; add docs({ description }) in the contract, mcp({ description }), or .describe()',
      },
      {
        level: 'warn',
        tool: 'legacy_report',
        message:
          'unclassified; treated as write. Add mcp({ effect }) in the contract or .effect()',
      },
      expect.objectContaining({ level: 'error', tool: 'internal_reindex' }),
      expect.objectContaining({ level: 'warn', tool: 'internal_reindex' }),
    ])
    const warnOnly = audit([tk.$toolset({ tools: all(tk.legacy) })], {
      missingDescription: 'warn',
    })
    expect(warnOnly.every((f) => f.level === 'warn')).toBe(true)
  })

  it('reports inner host tools and non-object output schemas', () => {
    const shaped = tk.user.find.output(z.string(), (u) => u.firstName)
    const findings = audit([
      tk.$toolset({
        hosts: {
          h: tk.$host({ description: 'H', tools: { shaped } }),
        },
      }),
    ])
    expect(findings).toEqual([
      {
        level: 'warn',
        tool: 'shaped',
        message:
          'output schema root is not an object; outputSchema is not advertised',
      },
    ])
  })

  it('warns on large toolsets and long names; errors on invalid names', () => {
    const many = Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [`t${i}`, tk.team.find]),
    )
    const long = 'x'.repeat(61)
    const findings = audit([
      tk.$toolset({
        tools: { ...many, [long]: tk.team.find, 'bad name': tk.team.find },
      }),
    ])
    expect(findings).toEqual([
      expect.objectContaining({
        level: 'warn',
        tool: 'toolset[0]',
        message: expect.stringContaining('lists 18 tools'),
      }),
      expect.objectContaining({ level: 'warn', tool: long }),
      expect.objectContaining({ level: 'error', tool: 'bad name' }),
    ])
  })
})
