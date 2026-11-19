import { procedure, router } from '@ts-pf/contract'
import { catalog } from '@ts-pf/docs'
import { stream } from '@ts-pf/stream'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { openapi } from '../src/openapi.js'
import type { OpenAPIOptions } from '../src/types.js'
import { codegenAppContract } from './app-contract.js'
import { unresolvedRefs } from './resolve-refs.js'

describe('streams', () => {
  const contract = router({
    chat: procedure
      .input(z.object({ prompt: z.string() }))
      .output(stream(z.object({ token: z.string() }))),
    ingest: procedure.input(stream(z.object({ chunk: z.number() }))),
  })

  it('advertises JSONL for stream output and keeps errors as JSON', () => {
    const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
      info: { title: 'Planet API', version: '1' },
    })
    const chat = spec.paths['/rpc/chat']?.post
    expect(chat?.requestBody?.content).toHaveProperty('application/json')
    expect(chat?.requestBody?.content).not.toHaveProperty('text/event-stream')
    expect(chat?.responses['200']?.content).toHaveProperty('application/jsonl')
    expect(chat?.responses['200']?.content).not.toHaveProperty(
      'application/json',
    )
    expect(chat?.responses['200']?.content).not.toHaveProperty(
      'text/event-stream',
    )
    expect(chat?.responses['422']?.content).toHaveProperty('application/json')
  })

  it('adds SSE when opted in', () => {
    const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
      info: { title: 'Planet API', version: '1' },
      sse: true,
    })
    expect(
      spec.paths['/rpc/chat']?.post?.responses['200']?.content,
    ).toHaveProperty('text/event-stream')
  })

  it('advertises JSONL for stream input, not JSON', () => {
    const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
      info: { title: 'Planet API', version: '1' },
    })
    const ingest = spec.paths['/rpc/ingest']?.post
    expect(ingest?.requestBody?.content).toHaveProperty('application/jsonl')
    expect(ingest?.requestBody?.content).not.toHaveProperty('application/json')
  })
})

describe('streams option', () => {
  const contract = router({
    chat: procedure
      .input(z.object({ prompt: z.string() }))
      .output(stream(z.object({ token: z.string() })))
      .errors({ BUSY: { status: 503 } }),
    ingest: procedure
      .input(stream(z.object({ chunk: z.number() })))
      .output(z.object({ count: z.number() })),
    ping: procedure.output(z.object({ ok: z.boolean() })),
  })
  const build = (options: Omit<OpenAPIOptions, 'info'>) => {
    const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
      info: { title: 'Chat API', version: '1' },
      ...options,
    })
    expect(unresolvedRefs(spec)).toEqual([])
    return spec
  }
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

  it("'operation' (default) keeps stream operations and no extension", () => {
    const spec = build({})
    expect(Object.keys(spec.paths)).toEqual([
      '/rpc/chat',
      '/rpc/ingest',
      '/rpc/ping',
    ])
    expect(spec).not.toHaveProperty('x-ts-pf-streams')
    expect(build({ streams: 'operation' })).toEqual(spec)
  })

  it("'components' moves stream procedures to x-ts-pf-streams", () => {
    const spec = build({ streams: 'components' })
    expect(Object.keys(spec.paths)).toEqual(['/rpc/ping'])
    expect(spec['x-ts-pf-streams']).toEqual({
      chat: {
        input: ref('chat.Input'),
        item: ref('chat.Output'),
        errors: [
          'BAD_REQUEST',
          'PAYLOAD_TOO_LARGE',
          'VALIDATION',
          'INTERNAL',
          'BUSY',
        ],
      },
      ingest: {
        inputItem: ref('ingest.Input'),
        output: ref('ingest.Output'),
        errors: ['BAD_REQUEST', 'PAYLOAD_TOO_LARGE', 'VALIDATION', 'INTERNAL'],
      },
    })
    const names = Object.keys(spec.components.schemas)
    expect(names).toEqual(
      expect.arrayContaining(['chat.Input', 'chat.Output', 'Error.BUSY']),
    )
    expect(names).not.toContain('chat.Request')
    expect(names).not.toContain('chat.Success')
  })

  it("'components' follows naming and closeInputs", () => {
    const spec = build({
      streams: 'components',
      naming: 'pascal',
      closeInputs: true,
    })
    expect(spec['x-ts-pf-streams']?.chat).toMatchObject({
      input: ref('ChatInput'),
      item: ref('ChatOutput'),
    })
    expect(spec.components.schemas.ChatInput).toMatchObject({
      additionalProperties: false,
    })
    expect(spec.components.schemas.ChatOutput).not.toHaveProperty(
      'additionalProperties',
    )
  })

  it("'components' with the codegen profile names the library stream", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const spec = openapi(catalog(codegenAppContract, { prefix: '/rpc' }), {
      info: { title: 'Library API', version: '1' },
      profile: 'codegen',
      streams: 'components',
    })
    warn.mockRestore()
    expect(unresolvedRefs(spec)).toEqual([])
    expect(spec.paths).not.toHaveProperty('/rpc/book/watch')
    expect(spec['x-ts-pf-streams']).toEqual({
      'book/watch': {
        errors: ['BAD_REQUEST', 'PAYLOAD_TOO_LARGE', 'VALIDATION', 'INTERNAL'],
        input: ref('BookWatchInput'),
        item: ref('BookWatchOutput'),
      },
    })
    expect(spec.components.schemas.BookWatchOutput).toMatchObject({
      discriminator: { propertyName: 'type' },
    })
  })

  it("'omit' leaves stream procedures out entirely", () => {
    const spec = build({ streams: 'omit' })
    expect(Object.keys(spec.paths)).toEqual(['/rpc/ping'])
    expect(spec).not.toHaveProperty('x-ts-pf-streams')
    const names = Object.keys(spec.components.schemas)
    expect(names.some((name) => name.startsWith('chat.'))).toBe(false)
    expect(names).not.toContain('Error.BUSY')
  })
})
