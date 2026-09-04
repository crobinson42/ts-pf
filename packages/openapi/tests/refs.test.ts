import { procedure, router } from '@ts-pf/contract'
import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { openapi } from '../src/openapi.js'
import { relocateRefs } from '../src/refs.js'

describe('relocateRefs', () => {
  it('rewrites document-root $ref and $defs pointers under the component', () => {
    const relocated = relocateRefs(
      {
        $ref: '#/$defs/Node',
        $defs: {
          Node: {
            type: 'object',
            properties: {
              child: { $ref: '#/$defs/Node' },
              self: { $ref: '#' },
            },
          },
        },
      },
      'planet.tree.Request',
    )
    expect(relocated.$ref).toBe(
      '#/components/schemas/planet.tree.Request/$defs/Node',
    )
    const node = (
      relocated.$defs as {
        Node: { properties: Record<string, { $ref: string }> }
      }
    ).Node
    expect(node.properties.child?.$ref).toBe(
      '#/components/schemas/planet.tree.Request/$defs/Node',
    )
    expect(node.properties.self?.$ref).toBe(
      '#/components/schemas/planet.tree.Request',
    )
  })

  it('leaves component and external refs alone', () => {
    expect(
      relocateRefs(
        { $ref: '#/components/schemas/Other' },
        'planet.find.Request',
      ),
    ).toEqual({ $ref: '#/components/schemas/Other' })
    expect(
      relocateRefs(
        { $ref: 'https://example.com/schema.json' },
        'planet.find.Request',
      ),
    ).toEqual({ $ref: 'https://example.com/schema.json' })
  })

  it('rewrites recursive Zod $refs inside the generated document', () => {
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
    expect(dumped).toMatch(/#\/components\/schemas\/planet\.tree\./)
  })
})
