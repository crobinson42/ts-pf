import type { StandardSchemaV1 } from '@standard-schema/spec'
import { toValidationIssues, validateSchema } from '@ts-pf/contract'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('toValidationIssues', () => {
  it('unwraps { key } segments, keeps numbers, and stringifies other keys', () => {
    const sym = Symbol('tag')
    const issues: StandardSchemaV1.Issue[] = [
      { message: 'root' },
      { message: 'plain', path: ['user', 0, 'name'] },
      { message: 'keyed', path: [{ key: 'items' }, { key: 2 }, { key: sym }] },
      { message: 'symbol', path: [sym] },
    ]
    expect(toValidationIssues(issues)).toEqual([
      { message: 'root', path: [] },
      { message: 'plain', path: ['user', 0, 'name'] },
      { message: 'keyed', path: ['items', 2, 'Symbol(tag)'] },
      { message: 'symbol', path: ['Symbol(tag)'] },
    ])
  })

  it('matches what the built-in Standard Schema adapter reports', async () => {
    const schema = z.object({
      items: z.array(z.object({ id: z.number() })),
    })
    const value = { items: [{ id: 1 }, { id: 'x' }] }
    const raw = await schema['~standard'].validate(value)
    if (!('issues' in raw) || !raw.issues) throw new Error('expected issues')
    const builtIn = await validateSchema(schema, value)
    if (builtIn.success) throw new Error('expected failure')
    expect(toValidationIssues(raw.issues)).toEqual(builtIn.issues)
    expect(builtIn.issues[0]?.path).toEqual(['items', 1, 'id'])
  })
})
