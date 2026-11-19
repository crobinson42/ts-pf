import { procedure, router } from '@ts-pf/contract'
import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { openapi } from '../src/openapi.js'
import { defTarget, relocateRef, rewriteRefs } from '../src/refs.js'

describe('refs', () => {
  it('reads the def key and the rest of a $defs / definitions pointer', () => {
    expect(defTarget('#/$defs/Node')).toEqual({ key: 'Node', rest: '' })
    expect(defTarget('#/definitions/a~1b/properties/x')).toEqual({
      key: 'a/b',
      rest: '/properties/x',
    })
    expect(defTarget('#/properties/x')).toBeUndefined()
    expect(defTarget('#')).toBeUndefined()
  })

  it('relocates document-relative refs under a component', () => {
    expect(relocateRef('#', 'planet.tree.Input')).toBe(
      '#/components/schemas/planet.tree.Input',
    )
    expect(relocateRef('#/properties/child', 'planet.tree.Input')).toBe(
      '#/components/schemas/planet.tree.Input/properties/child',
    )
  })

  it('leaves component refs and anchors alone', () => {
    expect(relocateRef('#/components/schemas/Other', 'planet.find.Input')).toBe(
      '#/components/schemas/Other',
    )
    expect(relocateRef('#node', 'planet.find.Input')).toBe('#node')
  })

  it('rewrites local refs in schema positions only', () => {
    const rewritten = rewriteRefs(
      {
        properties: { child: { $ref: '#/$defs/Node' } },
        items: [{ $ref: '#' }],
        const: { $ref: '#/$defs/Node' },
        default: { $ref: '#' },
        allOf: [{ $ref: 'https://example.com/schema.json' }],
      },
      (ref) => `rewritten:${ref}`,
    )
    expect(rewritten).toEqual({
      properties: { child: { $ref: 'rewritten:#/$defs/Node' } },
      items: [{ $ref: 'rewritten:#' }],
      const: { $ref: '#/$defs/Node' },
      default: { $ref: '#' },
      allOf: [{ $ref: 'https://example.com/schema.json' }],
    })
  })

  it('rewrites recursive Zod $refs onto the hoisted inner schema', () => {
    const Node: z.ZodType<{ name: string; child?: unknown }> = z.object({
      name: z.string(),
      get child() {
        return Node.optional()
      },
    })
    const spec = openapi(
      catalog(
        router({
          planet: {
            tree: procedure.input(Node).output(Node),
          },
        }),
      ),
      { info: { title: 'Planet API', version: '1' } },
    )
    const dumped = JSON.stringify(spec)
    expect(dumped).not.toMatch(/"\$ref":"#\/\$defs\//)
    expect(dumped).not.toMatch(/"\$ref":"#"/)
    const input = spec.components.schemas['planet.tree.Input'] as {
      type?: string
      required?: string[]
      properties?: { name?: unknown; child?: { $ref?: string } }
    }
    expect(input.type).toBe('object')
    expect(input.required).toEqual(['name'])
    expect(input.properties?.name).toMatchObject({ type: 'string' })
    expect(input.properties?.child?.$ref).toBe(
      '#/components/schemas/planet.tree.Input',
    )
    expect(spec.components.schemas['planet.tree.Request']).toMatchObject({
      properties: {
        input: { $ref: '#/components/schemas/planet.tree.Input' },
      },
    })
  })
})
