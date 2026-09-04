import { procedure, router } from '@ts-pf/contract'
import { catalog } from '@ts-pf/docs'
import { stream } from '@ts-pf/stream'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { openapi } from '../src/openapi.js'

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
