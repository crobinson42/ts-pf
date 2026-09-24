import { asResult } from '@ts-pf/client'
import { createRuntime } from '@ts-pf/example-clean-arch-api'
import { afterAll, describe, expect, it } from 'vitest'
import { createHttpClient, createWsClient } from '../src/client.js'
import { pairedSockets } from './fake-websocket.js'

const runtime = createRuntime()
const sockets = pairedSockets()
const binding = runtime.bindWebSocket(sockets.server, {
  traceId: 'ws-ada',
  actorId: 'ada',
})
const ws = createWsClient(sockets.client)

const fetchImpl: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init)
  return runtime.fetch(req)
}

const http = createHttpClient(fetchImpl, {
  'x-trace-id': 'http-ada',
  'x-actor-id': 'ada',
})
const ben = createHttpClient(fetchImpl, {
  'x-trace-id': 'http-ben',
  'x-actor-id': 'ben',
})
const anon = createHttpClient(fetchImpl, { 'x-trace-id': 'http-anon' })

async function waitForSubscribers(count: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (runtime.clientEvents.listenerCount() === count) {
      return
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  }
  throw new Error(`expected ${count} watch subscribers`)
}

describe('clean-arch', () => {
  afterAll(() => {
    ws.close()
    binding.close()
  })

  it('creates, reads, and completes a task over HTTP', async () => {
    const created = await http.task.create({ title: '  Write plan  ' })
    expect(created).toEqual({
      id: created.id,
      title: 'Write plan',
      completed: false,
    })
    expect(await http.task.get({ id: created.id })).toEqual(created)
    expect(await http.task.list()).toEqual(expect.arrayContaining([created]))

    const completed = await http.task.complete({ id: created.id })
    expect(completed).toEqual({ ...created, completed: true })

    const again = await asResult(http.task.complete({ id: created.id }))
    expect(again.ok).toBe(false)
    if (!again.ok) {
      expect(again.error.code).toBe('ALREADY_COMPLETE')
    }

    const missing = await asResult(http.task.get({ id: 'missing' }))
    expect(missing.ok).toBe(false)
    if (!missing.ok) {
      expect(missing.error.code).toBe('NOT_FOUND')
    }

    const blank = await asResult(http.task.create({ title: '   ' }))
    expect(blank.ok).toBe(false)
    if (!blank.ok) {
      expect(blank.error.code).toBe('VALIDATION')
    }
  })

  it('uses the same tasks over WebSocket', async () => {
    const created = await ws.client.task.create({ title: 'Review' })
    expect(await ws.client.task.get({ id: created.id })).toEqual(created)
    expect(await http.task.get({ id: created.id })).toEqual(created)

    const completed = await ws.client.task.complete({ id: created.id })
    expect(completed.completed).toBe(true)
    expect(await http.task.get({ id: created.id })).toEqual(completed)
  })

  it('streams task.changed from a websocket write to an HTTP watch', async () => {
    const controller = new AbortController()
    const pending = http.task.watch({ signal: controller.signal })
    try {
      await waitForSubscribers(1)
      const created = await ws.client.task.create({ title: 'Ship it' })
      const completed = await ws.client.task.complete({ id: created.id })
      const stream = await pending
      const seen: unknown[] = []
      for await (const event of stream) {
        seen.push(event)
        if (seen.length === 2) {
          break
        }
      }
      expect(seen).toEqual([
        { type: 'task.changed', task: created },
        { type: 'task.changed', task: completed },
      ])
    } finally {
      controller.abort()
    }
  })

  it('rejects a valid complete from an anonymous caller', async () => {
    const result = await asResult(anon.task.complete({ id: 'task-1' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN')
    }
  })

  it('validates a blank title before the actor guard on the wire', async () => {
    const result = await asResult(anon.task.create({ title: '   ' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION')
    }
  })

  it('lets ben create a task and forbids completing it', async () => {
    const created = await ben.task.create({ title: 'Ben task' })
    const result = await asResult(ben.task.complete({ id: created.id }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN')
    }
  })

  it('stops a batch on the first missing id after saving earlier ids', async () => {
    const created = await http.task.create({ title: 'Batch me' })
    const result = await asResult(
      http.task.finish({ taskIds: [created.id, 'missing'] }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND')
    }
    expect(await http.task.get({ id: created.id })).toEqual({
      ...created,
      completed: true,
    })
  })

  it('rejects an empty finish batch as validation', async () => {
    const result = await asResult(http.task.finish({ taskIds: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION')
    }
  })

  it('does not subscribe an anonymous watch', async () => {
    const before = runtime.clientEvents.listenerCount()
    const result = await asResult(anon.task.watch())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN')
    }
    expect(runtime.clientEvents.listenerCount()).toBe(before)
  })

  it('forbids create on an anonymous socket and still lists', async () => {
    const pair = pairedSockets()
    const anonBinding = runtime.bindWebSocket(pair.server, {
      traceId: 'ws-anon',
      actorId: null,
    })
    const client = createWsClient(pair.client)
    try {
      const created = await asResult(
        client.client.task.create({ title: 'Nope' }),
      )
      expect(created.ok).toBe(false)
      if (!created.ok) {
        expect(created.error.code).toBe('FORBIDDEN')
      }
      expect(await client.client.task.list()).toEqual(expect.any(Array))
    } finally {
      client.close()
      anonBinding.close()
    }
  })
})
