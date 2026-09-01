import { Type } from '@sinclair/typebox'
import { registerSchemaAdapter, validateSchema } from '@ts-pf/contract'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('validateSchema', () => {
  it('validates Zod via Standard Schema', async () => {
    const schema = z.object({ id: z.number() })
    const result = await validateSchema(schema, { id: 1 })
    expect(result).toEqual({ success: true, value: { id: 1 } })
  })

  it('returns issues for invalid Zod input', async () => {
    const result = await validateSchema(z.object({ id: z.number() }), {
      id: 'x',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0]?.message).toBeTruthy()
    }
  })

  it('validates TypeBox schemas without Standard Schema', async () => {
    const schema = Type.Object({ name: Type.String() })
    const result = await validateSchema(schema, { name: 'Earth' })
    expect(result).toEqual({ success: true, value: { name: 'Earth' } })
  })

  it('returns issues for invalid TypeBox input', async () => {
    const result = await validateSchema(Type.Object({ name: Type.String() }), {
      name: 1,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.length).toBeGreaterThan(0)
    }
  })

  it('throws on unknown schema objects', async () => {
    await expect(validateSchema({ not: 'a schema' }, {})).rejects.toThrow(
      /schema adapter/i,
    )
  })

  it('uses a registered adapter first', async () => {
    registerSchemaAdapter({
      vendor: 'always-pass',
      accept: (schema) =>
        typeof schema === 'object' && schema !== null && 'custom' in schema,
      async validate(_schema, value) {
        return { success: true, value }
      },
    })
    const result = await validateSchema({ custom: true }, { ok: 1 })
    expect(result).toEqual({ success: true, value: { ok: 1 } })
  })
})
