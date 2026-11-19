import { procedure, router } from '@ts-pf/contract'
import { catalog } from '@ts-pf/docs'
import Type from 'typebox'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { closeInputs } from '../src/close-inputs.js'
import { openapi } from '../src/openapi.js'
import type { OpenAPIOptions } from '../src/types.js'
import { appContract, codegenAppContract } from './app-contract.js'
import { unresolvedRefs } from './resolve-refs.js'

type ProfileOptions = Omit<OpenAPIOptions, 'info'>

function build(contract: unknown, options: ProfileOptions) {
  const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
    info: { title: 'Library API', version: '1' },
    ...options,
  })
  expect(unresolvedRefs(spec)).toEqual([])
  return spec
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

const planet = router({
  planet: {
    find: procedure
      .input(z.object({ id: z.string() }))
      .output(z.object({ id: z.string(), name: z.string() }))
      .errors({
        NOT_FOUND: { status: 404, data: z.object({ id: z.string() }) },
      }),
  },
  ping: procedure,
})

describe('profile resolution', () => {
  it('leaves the default document unchanged when every option is at its default', () => {
    const plain = build(appContract, {})
    const explicit = build(appContract, {
      envelopes: 'components',
      errors: 'per-code',
      naming: 'path',
      closeInputs: false,
      constAsEnum: false,
      dropFormatPatterns: false,
      emptyInputNull: false,
    })
    expect(explicit).toEqual(plain)
  })

  it('lets an explicit option override the profile', () => {
    const spec = build(codegenAppContract, {
      profile: 'codegen',
      naming: 'path',
    })
    const names = Object.keys(spec.components.schemas)
    expect(names).toContain('book.list.Input')
    expect(names).not.toContain('BookListInput')
    // The rest of the profile still applies.
    expect(names).toContain('RpcError')
    expect(names).not.toContain('book.list.Request')
  })

  it('throws on an unknown profile', () => {
    expect(() =>
      build(planet, { profile: 'rest' as unknown as 'codegen' }),
    ).toThrow(/unknown profile "rest"/)
  })
})

describe('envelopes', () => {
  it("'inline' puts envelopes in the operation and names only Input / Output", () => {
    const spec = build(planet, { envelopes: 'inline' })
    const names = Object.keys(spec.components.schemas)
    expect(names).toContain('planet.find.Input')
    expect(names).toContain('planet.find.Output')
    expect(names).not.toContain('planet.find.Request')
    expect(names).not.toContain('planet.find.Success')
    const find = spec.paths['/rpc/planet/find']?.post
    expect(
      find?.requestBody?.content['application/json']?.schema,
    ).toMatchObject({
      additionalProperties: false,
      properties: { input: ref('planet.find.Input') },
    })
    expect(
      find?.responses['200']?.content?.['application/json']?.schema,
    ).toMatchObject({
      properties: { ok: { const: true }, output: ref('planet.find.Output') },
    })
  })
})

describe('errors', () => {
  it("'shared' writes ErrorCode, RpcError, and one <Code>Data per code", () => {
    const spec = build(planet, { errors: 'shared' })
    const { schemas } = spec.components
    expect(schemas.ErrorCode).toEqual({
      type: 'string',
      enum: [
        'NOT_FOUND',
        'BAD_REQUEST',
        'VALIDATION',
        'INTERNAL',
        'PAYLOAD_TOO_LARGE',
      ],
    })
    expect(schemas.RpcError).toMatchObject({
      additionalProperties: false,
      required: ['ok', 'error'],
      properties: {
        ok: { const: false },
        error: {
          additionalProperties: false,
          required: ['code', 'message'],
          properties: { code: ref('ErrorCode') },
        },
      },
    })
    expect(schemas.NotFoundData).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    })
    expect(schemas).toHaveProperty('ValidationErrorData')
    expect(Object.keys(schemas).some((n) => n.includes('Error.'))).toBe(false)
  })

  it("'shared' refs RpcError from every error response and lists the codes", () => {
    const spec = build(planet, { errors: 'shared' })
    const find = spec.paths['/rpc/planet/find']?.post
    for (const response of Object.entries(find?.responses ?? {})) {
      const [status, body] = response
      if (status !== '200') {
        expect(body.content?.['application/json']?.schema).toEqual(
          ref('RpcError'),
        )
      }
    }
    expect(find?.['x-ts-pf-errors']).toEqual([
      'BAD_REQUEST',
      'NOT_FOUND',
      'PAYLOAD_TOO_LARGE',
      'VALIDATION',
      'INTERNAL',
    ])
    // No input: no VALIDATION.
    expect(spec.paths['/rpc/ping']?.post?.['x-ts-pf-errors']).toEqual([
      'BAD_REQUEST',
      'PAYLOAD_TOO_LARGE',
      'INTERNAL',
    ])
  })

  it("'shared' lists only declared codes when protocolErrors is false", () => {
    const spec = build(planet, { errors: 'shared', protocolErrors: false })
    expect(spec.components.schemas.ErrorCode).toEqual({
      type: 'string',
      enum: ['NOT_FOUND'],
    })
    expect(spec.paths['/rpc/ping']?.post?.['x-ts-pf-errors']).toEqual([])
  })

  it("'shared' accepts a procedure that declares the code without data", () => {
    const spec = build(
      router({
        a: procedure.errors({
          GONE: { status: 410, data: z.object({ id: z.string() }) },
        }),
        b: procedure.errors({ GONE: { status: 410 } }),
      }),
      { errors: 'shared' },
    )
    expect(spec.components.schemas).toHaveProperty('GoneData')
  })

  it("'shared' throws when one code has two data shapes", () => {
    expect(() => build(appContract, { errors: 'shared' })).toThrow(
      /error code "CONFLICT" has different data shapes \(book\.create, loan\.create\).*declare one shape per code or rename one/,
    )
  })

  it("'per-code' does not add x-ts-pf-errors", () => {
    const spec = build(planet, {})
    expect(spec.paths['/rpc/planet/find']?.post).not.toHaveProperty(
      'x-ts-pf-errors',
    )
  })
})

describe('naming', () => {
  it("'pascal' names per-procedure components from the path", () => {
    const spec = build(
      router({
        auth: {
          verifyCode: procedure
            .input(z.object({ code: z.string() }))
            .output(z.object({ token: z.string() }))
            .errors({
              EXPIRED_CODE: { status: 410, data: z.object({ at: z.string() }) },
            }),
        },
      }),
      { naming: 'pascal' },
    )
    expect(Object.keys(spec.components.schemas)).toEqual(
      expect.arrayContaining([
        'AuthVerifyCodeInput',
        'AuthVerifyCodeOutput',
        'AuthVerifyCodeRequest',
        'AuthVerifyCodeSuccess',
        'ExpiredCodeError',
        'ExpiredCodeErrorData',
        'TsPfValidationError',
        'TsPfValidationErrorData',
      ]),
    )
    expect(
      Object.keys(spec.components.schemas).some((n) => n.includes('.')),
    ).toBe(false)
    expect(spec.paths['/rpc/auth/verifyCode']?.post?.operationId).toBe(
      'auth.verifyCode',
    )
  })

  it("'pascal' uses an id instead of a bare alias, and names generated defs", () => {
    const spec = build(appContract, { naming: 'pascal' })
    const names = Object.keys(spec.components.schemas)
    expect(names).not.toContain('BookFindOutput')
    expect(names).toContain('BookReviewsOutputSchema0')
    expect(names).toContain('BookCreateConflictError')
    expect(names).toContain('LoanCreateConflictErrorData')
    expect(spec.components.schemas.BookFindSuccess).toMatchObject({
      properties: { output: ref('Book') },
    })
    expect(spec.components.schemas.BookCreateRequest).toMatchObject({
      properties: { input: ref('BookInput') },
    })
  })

  it("'pascal' throws when two schemas get one name", () => {
    const contract = router({
      a: { bC: procedure.input(z.object({ x: z.string() })) },
      aB: { c: procedure.input(z.object({ y: z.number() })) },
    })
    expect(() => build(contract, { naming: 'pascal' })).toThrow(
      /gives "a\.bC\.Input" and "aB\.c\.Input" one component name "ABCInput".*distinct \.meta\(\{ id \}\)/,
    )
  })

  it("'pascal' clash goes away when one schema has an id", () => {
    const Y = z.object({ y: z.number() }).meta({ id: 'YInput' })
    const spec = build(
      router({
        a: { bC: procedure.input(z.object({ x: z.string() })) },
        aB: { c: procedure.input(Y) },
      }),
      { naming: 'pascal', envelopes: 'inline' },
    )
    expect(spec.components.schemas).toHaveProperty('ABCInput')
    expect(spec.components.schemas).toHaveProperty('YInput')
  })
})

describe('closeInputs', () => {
  it('closes objects only inputs reach and leaves shared components open', () => {
    const Tag = z.object({ name: z.string() }).meta({ id: 'Tag' })
    const spec = build(
      router({
        save: procedure
          .input(z.object({ tag: Tag, meta: z.object({ note: z.string() }) }))
          .output(Tag),
        record: procedure.input(z.record(z.string(), z.string())),
      }),
      { closeInputs: true },
    )
    const { schemas } = spec.components
    expect(schemas['save.Input']).toMatchObject({
      additionalProperties: false,
      properties: { meta: { additionalProperties: false } },
    })
    expect(schemas.Tag).not.toHaveProperty('additionalProperties')
    expect(schemas['save.Output']).toEqual(ref('Tag'))
    // A record already says what extra keys are.
    expect(schemas['record.Input']).toMatchObject({
      additionalProperties: { type: 'string' },
    })
  })

  it('leaves an id open when shared error data also uses it', () => {
    const Ref = z.object({ id: z.string() }).meta({ id: 'Ref' })
    const spec = build(
      router({
        find: procedure.input(Ref).errors({ GONE: { status: 410, data: Ref } }),
      }),
      { closeInputs: true, errors: 'shared' },
    )
    expect(spec.components.schemas.GoneData).toEqual(ref('Ref'))
    expect(spec.components.schemas.Ref).not.toHaveProperty(
      'additionalProperties',
    )
  })

  it('does not close allOf members', () => {
    const spec = build(
      router({
        both: procedure.input(
          Type.Intersect([
            Type.Object({ a: Type.String() }),
            Type.Object({ b: Type.String() }),
          ]),
        ),
      }),
      { closeInputs: true },
    )
    const input = spec.components.schemas['both.Input'] as {
      allOf: Record<string, unknown>[]
    }
    expect(input.allOf).toHaveLength(2)
    for (const member of input.allOf) {
      expect(member).not.toHaveProperty('additionalProperties')
    }
  })

  it('does not close an object that combines subschemas', () => {
    const spec = build(
      router({
        both: procedure.input(
          Type.Intersect([
            Type.Object({ a: Type.String() }),
            Type.Object({ b: Type.String() }),
          ]),
        ),
      }),
      { closeInputs: true },
    )
    const input = spec.components.schemas['both.Input'] as Record<
      string,
      unknown
    >
    // Same document with the parent typed as an object.
    const typed = { type: 'object', ...input }
    spec.components.schemas['both.Input'] = typed
    closeInputs(spec)
    expect(spec.components.schemas['both.Input']).not.toHaveProperty(
      'additionalProperties',
    )
  })
})

describe('constAsEnum', () => {
  it("'exceptTags' rewrites const as a one-value enum but keeps union tags", () => {
    const spec = build(appContract, { constAsEnum: 'exceptTags' })
    const { schemas, parameters } = spec.components
    expect(schemas.PrintMedia).toMatchObject({
      properties: { kind: { type: 'string', const: 'print' } },
    })
    expect(schemas.BookAdded).toMatchObject({
      properties: { type: { type: 'string', const: 'added' } },
    })
    expect(schemas['health.Success']).toMatchObject({
      properties: { ok: { enum: [true] } },
    })
    expect(parameters?.TsPfProtocol?.schema).toEqual({
      type: 'string',
      enum: ['1'],
    })
    expect(JSON.stringify(schemas['TsPf.Error.INTERNAL'])).toContain(
      '"code":{"enum":["INTERNAL"]}',
    )
  })

  it('keeps inline union tags and rewrites a const that does not tag', () => {
    const spec = build(
      router({
        shape: procedure.output(
          z.union([
            z.object({ kind: z.literal('a'), v: z.literal(1) }),
            z.object({ kind: z.literal('b'), v: z.literal(1) }),
          ]),
        ),
      }),
      { constAsEnum: 'exceptTags' },
    )
    const output = spec.components.schemas['shape.Output'] as {
      anyOf: Array<{ properties: Record<string, unknown> }>
    }
    expect(output.anyOf[0]?.properties.kind).toEqual({
      type: 'string',
      const: 'a',
    })
    expect(output.anyOf[0]?.properties.v).toEqual({
      type: 'number',
      enum: [1],
    })
  })
})

describe('dropFormatPatterns', () => {
  it('drops pattern next to a standard format and keeps other patterns', () => {
    const spec = build(
      router({
        sign: procedure.input(
          z.object({
            email: z.email(),
            at: z.iso.datetime(),
            id: z.cuid(),
            code: z.string().regex(/^[A-Z]{3}$/),
          }),
        ),
      }),
      { dropFormatPatterns: true },
    )
    const input = spec.components.schemas['sign.Input'] as {
      properties: Record<string, Record<string, unknown>>
    }
    expect(input.properties.email).toEqual({ type: 'string', format: 'email' })
    expect(input.properties.at).toEqual({
      type: 'string',
      format: 'date-time',
    })
    expect(input.properties.id).toHaveProperty('pattern')
    expect(input.properties.code).toHaveProperty('pattern')
  })
})

describe('emptyInputNull', () => {
  it('inlines { input: null } for no input and a null input, with no Input component', () => {
    const spec = build(
      router({
        ping: procedure,
        clear: procedure.input(z.null()),
        find: procedure.input(z.object({ id: z.string() })),
      }),
      { emptyInputNull: true },
    )
    const nullBody = {
      type: 'object',
      additionalProperties: false,
      properties: { input: { type: 'null' } },
    }
    for (const path of ['/rpc/ping', '/rpc/clear']) {
      expect(
        spec.paths[path]?.post?.requestBody?.content['application/json']
          ?.schema,
      ).toEqual(nullBody)
    }
    const names = Object.keys(spec.components.schemas)
    expect(names).not.toContain('clear.Input')
    expect(names).not.toContain('clear.Request')
    expect(names).not.toContain('ping.Request')
    expect(names).toContain('find.Request')
  })
})

describe('codegen profile', () => {
  const spec = build(codegenAppContract, { profile: 'codegen' })

  it('names every component without dots', () => {
    expect(
      Object.keys(spec.components.schemas).filter((n) => n.includes('.')),
    ).toEqual([])
  })

  it('lists each operation’s codes in x-ts-pf-errors', () => {
    expect(spec.paths['/rpc/book/create']?.post?.['x-ts-pf-errors']).toEqual([
      'BAD_REQUEST',
      'FORBIDDEN',
      'CONFLICT',
      'PAYLOAD_TOO_LARGE',
      'VALIDATION',
      'INTERNAL',
    ])
    expect(spec.paths['/rpc/health']?.post?.['x-ts-pf-errors']).toEqual([
      'BAD_REQUEST',
      'PAYLOAD_TOO_LARGE',
      'INTERNAL',
    ])
  })

  it('stays POST JSON RPC', () => {
    for (const item of Object.values(spec.paths)) {
      expect(Object.keys(item)).toEqual(['post'])
      for (const param of item.post?.parameters ?? []) {
        expect('$ref' in param).toBe(true)
      }
    }
  })
})
