import { type CatalogDiff, diffCatalog } from '@ts-pf/codegen'
import { procedure, router } from '@ts-pf/contract'
import { catalog, docs, type ProcedureCatalog } from '@ts-pf/docs'
import { stream } from '@ts-pf/stream'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

/** `kind path pointer` per change, so assertions read like the CLI. */
function summary(diff: CatalogDiff): { breaking: string[]; safe: string[] } {
  const line = (change: CatalogDiff['breaking'][number]) =>
    [change.kind, change.path, change.pointer].filter(Boolean).join(' ')
  return { breaking: diff.breaking.map(line), safe: diff.safe.map(line) }
}

function compare(previous: unknown, next: unknown) {
  return summary(diffCatalog(catalog(previous), catalog(next)))
}

const one = (proc: unknown) => router({ planet: { find: proc } })

describe('diffCatalog', () => {
  it('reports nothing for identical catalogs', () => {
    const contract = one(
      procedure
        .input(z.object({ id: z.number() }))
        .output(z.object({ id: z.number(), name: z.string() })),
    )
    expect(compare(contract, contract)).toEqual({ breaking: [], safe: [] })
  })

  it('ignores docs text', () => {
    const base = procedure.input(z.object({ id: z.number().describe('a') }))
    const next = procedure
      .input(z.object({ id: z.number().describe('b') }))
      .meta(docs({ summary: 'Find', description: 'Finds a planet' }))
    expect(compare(one(base), one(next))).toEqual({ breaking: [], safe: [] })
  })

  it('procedure removed is breaking; added is safe; rename is both', () => {
    const find = procedure.input(z.object({ id: z.number() }))
    expect(
      compare(router({ planet: { find } }), router({ planet: { get: find } })),
    ).toEqual({
      breaking: ['procedure-removed planet/find'],
      safe: ['procedure-added planet/get'],
    })
  })

  it('unary <-> stream is breaking for input and output', () => {
    const item = z.object({ token: z.string() })
    expect(
      compare(
        one(procedure.input(item).output(item)),
        one(procedure.input(stream(item)).output(stream(item))),
      ).breaking,
    ).toEqual([
      'procedure-kind-changed planet/find /input',
      'procedure-kind-changed planet/find /output',
    ])
  })

  it('compares stream items with the slot direction', () => {
    expect(
      compare(
        one(procedure.output(stream(z.object({ token: z.string() })))),
        one(procedure.output(stream(z.object({ text: z.string() })))),
      ),
    ).toEqual({
      breaking: ['property-removed planet/find /output/item/properties/token'],
      safe: ['property-added planet/find /output/item/properties/text'],
    })
  })

  it('protocol version change is breaking', () => {
    const spec = catalog(one(procedure))
    const next: ProcedureCatalog = {
      ...spec,
      protocol: { ...spec.protocol, version: '2' },
    }
    expect(summary(diffCatalog(spec, next)).breaking).toEqual([
      'protocol-changed /protocol/version',
    ])
  })

  describe('input (what clients send)', () => {
    it('new required property is breaking; new optional is safe', () => {
      expect(
        compare(
          one(procedure.input(z.object({ id: z.number() }))),
          one(
            procedure.input(
              z.object({
                id: z.number(),
                name: z.string(),
                tag: z.string().optional(),
              }),
            ),
          ),
        ),
      ).toEqual({
        breaking: [
          'required-property-added planet/find /input/properties/name',
        ],
        safe: ['property-added planet/find /input/properties/tag'],
      })
    })

    it('optional -> required is breaking; required -> optional is safe', () => {
      expect(
        compare(
          one(
            procedure.input(
              z.object({ a: z.string().optional(), b: z.string() }),
            ),
          ),
          one(
            procedure.input(
              z.object({ a: z.string(), b: z.string().optional() }),
            ),
          ),
        ),
      ).toEqual({
        breaking: ['property-became-required planet/find /input/properties/a'],
        safe: ['property-became-optional planet/find /input/properties/b'],
      })
    })

    it('removing a property is safe when open, breaking when closed', () => {
      const prev = { id: z.number(), legacy: z.string().optional() }
      expect(
        compare(
          one(procedure.input(z.object(prev))),
          one(procedure.input(z.object({ id: z.number() }))),
        ),
      ).toEqual({
        breaking: [],
        safe: ['property-removed planet/find /input/properties/legacy'],
      })
      expect(
        compare(
          one(procedure.input(z.strictObject(prev))),
          one(procedure.input(z.strictObject({ id: z.number() }))),
        ).breaking,
      ).toEqual(['property-removed planet/find /input/properties/legacy'])
    })

    it('closing an open input is breaking', () => {
      expect(
        compare(
          one(procedure.input(z.object({ id: z.number() }))),
          one(procedure.input(z.strictObject({ id: z.number() }))),
        ).breaking,
      ).toEqual([
        'additional-properties-closed planet/find /input/additionalProperties',
      ])
    })

    it('narrowed types are breaking; widened types are safe', () => {
      expect(
        compare(
          one(
            procedure.input(
              z.object({
                kind: z.string(),
                size: z.number(),
                mode: z.enum(['a', 'b']),
                count: z.number().int(),
              }),
            ),
          ),
          one(
            procedure.input(
              z.object({
                kind: z.enum(['x', 'y']),
                size: z.number().int(),
                mode: z.enum(['a', 'c']),
                count: z.number(),
              }),
            ),
          ),
        ),
      ).toEqual({
        breaking: [
          'enum-added planet/find /input/properties/kind',
          'type-changed planet/find /input/properties/size',
          'enum-value-removed planet/find /input/properties/mode',
        ],
        safe: [
          'enum-value-added planet/find /input/properties/mode',
          'type-changed planet/find /input/properties/count',
        ],
      })
    })

    it('string -> number is breaking', () => {
      expect(
        compare(
          one(procedure.input(z.object({ id: z.string() }))),
          one(procedure.input(z.object({ id: z.number() }))),
        ).breaking,
      ).toEqual(['type-changed planet/find /input/properties/id'])
    })

    it('dropping null is breaking; accepting null is safe', () => {
      expect(
        compare(
          one(
            procedure.input(
              z.object({ a: z.string().nullable(), b: z.string() }),
            ),
          ),
          one(
            procedure.input(
              z.object({ a: z.string(), b: z.string().nullable() }),
            ),
          ),
        ),
      ).toEqual({
        breaking: ['nullable-removed planet/find /input/properties/a'],
        safe: ['nullable-added planet/find /input/properties/b'],
      })
    })

    it('union variant removed is breaking; added is safe', () => {
      const a = z.object({ type: z.literal('a'), x: z.number() })
      const b = z.object({ type: z.literal('b') })
      const c = z.object({ type: z.literal('c') })
      expect(
        compare(
          one(procedure.input(z.discriminatedUnion('type', [a, b]))),
          one(procedure.input(z.discriminatedUnion('type', [a, c]))),
        ),
      ).toEqual({
        breaking: ['variant-removed planet/find /input/oneOf/1'],
        safe: ['variant-added planet/find /input/oneOf/1'],
      })
    })

    it('matches variants by tag and diffs inside them', () => {
      const b = z.object({ type: z.literal('b') })
      expect(
        compare(
          one(
            procedure.input(
              z.discriminatedUnion('type', [
                z.object({ type: z.literal('a'), x: z.number() }),
                b,
              ]),
            ),
          ),
          one(
            procedure.input(
              z.discriminatedUnion('type', [
                b,
                z.object({
                  type: z.literal('a'),
                  x: z.number(),
                  y: z.string(),
                }),
              ]),
            ),
          ),
        ).breaking,
      ).toEqual([
        'required-property-added planet/find /input/oneOf/1/properties/y',
      ])
    })

    it('pairs a lone edited variant in an untagged union', () => {
      expect(
        compare(
          one(
            procedure.input(
              z.union([
                z.object({ a: z.string() }),
                z.object({ b: z.number() }),
              ]),
            ),
          ),
          one(
            procedure.input(
              z.union([
                z.object({ a: z.string() }),
                z.object({ b: z.number(), c: z.string() }),
              ]),
            ),
          ),
        ).breaking,
      ).toEqual([
        'required-property-added planet/find /input/anyOf/1/properties/c',
      ])
    })

    it('input schema added is breaking; removed is safe', () => {
      const withInput = one(procedure.input(z.object({ id: z.number() })))
      const without = one(procedure)
      expect(compare(without, withInput).breaking).toEqual([
        'schema-added planet/find /input',
      ])
      expect(compare(withInput, without).safe).toEqual([
        'schema-removed planet/find /input',
      ])
    })

    it('detects a change inside a $ref DTO through $defs', () => {
      const dto = (shape: z.ZodRawShape) =>
        z.object(shape).meta({ id: 'Planet' })
      const prev = dto({ id: z.number() })
      const next = dto({ id: z.number(), name: z.string() })
      const prevSpec = catalog(
        one(procedure.input(z.object({ a: prev, b: prev }))),
      )
      expect(JSON.stringify(prevSpec)).toContain('#/$defs/Planet')
      expect(
        compare(
          one(procedure.input(z.object({ a: prev, b: prev }))),
          one(procedure.input(z.object({ a: next, b: next }))),
        ).breaking,
      ).toEqual([
        'required-property-added planet/find /input/properties/a/properties/name',
        'required-property-added planet/find /input/properties/b/properties/name',
      ])
    })

    it('terminates on a recursive schema behind a nullable union', () => {
      type Node = { name: string; next: Node | null }
      const node: z.ZodType<Node> = z.lazy(() =>
        z.object({ name: z.string(), next: node.nullable() }),
      )
      const contract = one(procedure.input(node))
      expect(JSON.stringify(catalog(contract))).toContain('"anyOf"')
      expect(compare(contract, contract)).toEqual({ breaking: [], safe: [] })
    })

    it('compares a removed input property against the new catch-all', () => {
      expect(
        compare(
          one(
            procedure.input(z.object({ p: z.string() }).catchall(z.string())),
          ),
          one(procedure.input(z.object({}).catchall(z.number()))),
        ).breaking,
      ).toEqual([
        'type-changed planet/find /input/properties/p',
        'type-changed planet/find /input/additionalProperties',
      ])
    })

    it('a new catch-all schema on an open input is narrowing', () => {
      expect(
        compare(
          one(procedure.input(z.looseObject({ id: z.number() }))),
          one(
            procedure.input(z.object({ id: z.number() }).catchall(z.string())),
          ),
        ).breaking,
      ).toEqual(['type-changed planet/find /input/additionalProperties'])
    })

    it('terminates on recursive schemas', () => {
      type Node = { name: string; children: Node[] }
      const node: z.ZodType<Node> = z.lazy(() =>
        z.object({ name: z.string(), children: z.array(node) }),
      )
      const contract = one(procedure.input(node))
      expect(compare(contract, contract)).toEqual({ breaking: [], safe: [] })
    })
  })

  describe('output (what clients receive)', () => {
    it('required property removed is breaking; added is safe', () => {
      expect(
        compare(
          one(procedure.output(z.object({ id: z.number(), name: z.string() }))),
          one(procedure.output(z.object({ id: z.number(), mass: z.number() }))),
        ),
      ).toEqual({
        breaking: ['property-removed planet/find /output/properties/name'],
        safe: ['property-added planet/find /output/properties/mass'],
      })
    })

    it('optional property removed is safe', () => {
      expect(
        compare(
          one(
            procedure.output(
              z.object({ id: z.number(), note: z.string().optional() }),
            ),
          ),
          one(procedure.output(z.object({ id: z.number() }))),
        ),
      ).toEqual({
        breaking: [],
        safe: ['property-removed planet/find /output/properties/note'],
      })
    })

    it('required -> optional and becoming nullable are breaking', () => {
      expect(
        compare(
          one(procedure.output(z.object({ a: z.string(), b: z.string() }))),
          one(
            procedure.output(
              z.object({ a: z.string().optional(), b: z.string().nullable() }),
            ),
          ),
        ).breaking,
      ).toEqual([
        'property-became-optional planet/find /output/properties/a',
        'nullable-added planet/find /output/properties/b',
      ])
    })

    it('enum value added is safe; type change is breaking', () => {
      expect(
        compare(
          one(
            procedure.output(
              z.object({ s: z.enum(['a', 'b']), n: z.string() }),
            ),
          ),
          one(
            procedure.output(
              z.object({ s: z.enum(['a', 'b', 'c']), n: z.number() }),
            ),
          ),
        ),
      ).toEqual({
        breaking: ['type-changed planet/find /output/properties/n'],
        safe: ['enum-value-added planet/find /output/properties/s'],
      })
    })

    it('union variant added or removed is safe', () => {
      const a = z.object({ type: z.literal('a') })
      const b = z.object({ type: z.literal('b') })
      const c = z.object({ type: z.literal('c') })
      expect(
        compare(
          one(procedure.output(z.discriminatedUnion('type', [a, b]))),
          one(procedure.output(z.discriminatedUnion('type', [a, b, c]))),
        ),
      ).toEqual({
        breaking: [],
        safe: ['variant-added planet/find /output/oneOf/2'],
      })
      expect(
        compare(
          one(procedure.output(z.discriminatedUnion('type', [a, b]))),
          one(procedure.output(a)),
        ),
      ).toEqual({
        breaking: [],
        safe: ['variant-removed planet/find /output/oneOf/1'],
      })
    })

    it('output schema removed is breaking', () => {
      expect(
        compare(one(procedure.output(z.string())), one(procedure)).breaking,
      ).toEqual(['schema-removed planet/find /output'])
    })
  })

  describe('errors', () => {
    it('error code added or removed is safe', () => {
      expect(
        compare(
          one(procedure.errors({ NOT_FOUND: { status: 404 } })),
          one(procedure.errors({ CONFLICT: { status: 409 } })),
        ),
      ).toEqual({
        breaking: [],
        safe: [
          'error-removed planet/find /errors/NOT_FOUND',
          'error-added planet/find /errors/CONFLICT',
        ],
      })
    })

    it('error data is compared like output; status change is safe', () => {
      expect(
        compare(
          one(
            procedure.errors({
              NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
            }),
          ),
          one(
            procedure.errors({
              NOT_FOUND: { status: 410, data: z.object({ id: z.string() }) },
            }),
          ),
        ),
      ).toEqual({
        breaking: [
          'type-changed planet/find /errors/NOT_FOUND/data/properties/id',
        ],
        safe: ['error-status-changed planet/find /errors/NOT_FOUND/status'],
      })
    })
  })

  it('reports a new deprecation as safe', () => {
    expect(
      compare(one(procedure), one(procedure.meta(docs({ deprecated: true })))),
    ).toEqual({
      breaking: [],
      safe: ['deprecated planet/find /docs/deprecated'],
    })
  })

  it('reports an availability change as safe and does not compare', () => {
    const spec = catalog(one(procedure.input(z.object({ id: z.number() }))))
    const [proc] = spec.procedures
    if (proc === undefined) throw new Error('no procedure')
    const next: ProcedureCatalog = {
      ...spec,
      procedures: [
        { ...proc, input: { kind: 'unavailable', reason: 'no converter' } },
      ],
    }
    expect(summary(diffCatalog(spec, next))).toEqual({
      breaking: [],
      safe: ['schema-availability-changed planet/find /input'],
    })
  })

  it('tighter input bounds are breaking; looser are safe', () => {
    expect(
      compare(
        one(procedure.input(z.object({ name: z.string().min(1).max(10) }))),
        one(procedure.input(z.object({ name: z.string().min(3).max(20) }))),
      ),
    ).toEqual({
      breaking: ['bound-changed planet/find /input/properties/name/minLength'],
      safe: ['bound-changed planet/find /input/properties/name/maxLength'],
    })
  })

  it('looser output bounds are breaking', () => {
    expect(
      compare(
        one(procedure.output(z.array(z.string()).max(10))),
        one(procedure.output(z.array(z.string()))),
      ).breaking,
    ).toEqual(['bound-changed planet/find /output/maxItems'])
  })

  it('reports keywords it does not model as safe unknown-change', () => {
    expect(
      compare(
        one(procedure.input(z.object({ code: z.string().regex(/^a/) }))),
        one(procedure.input(z.object({ code: z.string().regex(/^b/) }))),
      ),
    ).toEqual({
      breaking: [],
      safe: ['unknown-change planet/find /input/properties/code/pattern'],
    })
  })

  it('changes are plain JSON', () => {
    const diff = diffCatalog(
      catalog(one(procedure.input(z.object({ id: z.number() })))),
      catalog(one(procedure.input(z.object({ id: z.string() })))),
    )
    expect(JSON.parse(JSON.stringify(diff))).toEqual(diff)
    expect(diff.breaking[0]).toEqual({
      kind: 'type-changed',
      path: 'planet/find',
      pointer: '/input/properties/id',
      message: 'input: type number -> string',
    })
  })
})

describe('diffCatalog: expand', () => {
  const Ref = z.object({ id: z.string() })
  const Doc = z.object({
    authorId: z.union([z.string(), Ref]),
    editorId: z.union([z.string(), Ref]),
  })
  const input = z.object({
    populate: z.array(z.enum(['authorId', 'editorId'])).optional(),
  })
  const base = procedure.input(input).output(z.object({ docs: z.array(Doc) }))
  const page = (fields: Record<string, z.ZodType>, at = ['docs']) =>
    one(base.expand({ key: 'populate', at, fields } as never))

  it('adding expand or a field is safe; removing either is breaking', () => {
    expect(compare(one(base), page({ authorId: Ref }))).toEqual({
      breaking: [],
      safe: ['expand-added planet/find /expand'],
    })
    expect(compare(page({ authorId: Ref }), one(base))).toEqual({
      breaking: ['expand-removed planet/find /expand'],
      safe: [],
    })
    expect(
      compare(page({ authorId: Ref }), page({ authorId: Ref, editorId: Ref })),
    ).toEqual({
      breaking: [],
      safe: ['expand-field-added planet/find /expand/fields/editorId'],
    })
    expect(
      compare(page({ authorId: Ref, editorId: Ref }), page({ authorId: Ref })),
    ).toEqual({
      breaking: ['expand-field-removed planet/find /expand/fields/editorId'],
      safe: [],
    })
  })

  it('moving the expansion is breaking', () => {
    expect(
      compare(page({ authorId: Ref }), page({ authorId: Ref }, [])).breaking,
    ).toEqual(['expand-changed planet/find /expand/at'])
  })

  it('compares a field schema as output', () => {
    const narrower = z.object({ id: z.string(), email: z.string() })
    const diff = compare(page({ authorId: Ref }), page({ authorId: narrower }))
    expect(diff.breaking).toEqual([])
    expect(diff.safe.join('\n')).toContain('/expand/fields/authorId')
  })
})
