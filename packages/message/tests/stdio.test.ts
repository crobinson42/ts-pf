import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createStdioDuplex } from '../src/stdio.js'

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../src')

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function waitUntil(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 80; i++) {
    if (pred()) {
      return
    }
    await nextTurn()
  }
  throw new Error('timed out waiting for condition')
}

describe('createStdioDuplex', () => {
  it('is not exported from the package root and index does not import stdio', async () => {
    const exported = await import('../src/index.js')
    expect(exported).not.toHaveProperty('createStdioDuplex')
    const index = await readFile(join(srcDir, 'index.ts'), 'utf8')
    expect(index).not.toMatch(/stdio/)
  })

  it('delivers NDJSON lines and writes a trailing newline', () => {
    const input = new PassThrough()
    const output = new PassThrough()
    output.setEncoding('utf8')
    let written = ''
    output.on('data', (chunk: string) => {
      written += chunk
    })
    const received: string[] = []
    const duplex = createStdioDuplex({ input, output })
    duplex.onMessage((text) => {
      received.push(text)
    })

    input.write('hello\n')
    input.write('world\n')
    expect(received).toEqual(['hello', 'world'])

    duplex.send('out')
    expect(written).toBe('out\n')
    duplex.close()
  })

  it('closes and drops the buffer when an unterminated line exceeds maxFrameBytes', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    let closed = false
    const duplex = createStdioDuplex({ input, output }, { maxFrameBytes: 80 })
    duplex.onClose(() => {
      closed = true
    })
    const received: string[] = []
    duplex.onMessage((text) => {
      received.push(text)
    })

    input.write(`{"pad":"${'x'.repeat(200)}"`)
    await nextTurn()
    expect(closed).toBe(true)
    expect(received).toEqual([])

    input.write('}\n')
    await nextTurn()
    expect(received).toEqual([])
  })

  it('delivers a trailing frame on end then closes on the next turn', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const duplex = createStdioDuplex({ input, output })
    const log: string[] = []
    duplex.onMessage((text) => {
      log.push(text)
    })
    duplex.onClose(() => {
      log.push('close')
    })

    input.end('last')
    await waitUntil(() => log.length > 0)
    expect(log[0]).toBe('last')
    await waitUntil(() => log.includes('close'))
    expect(log).toEqual(['last', 'close'])
  })
})
