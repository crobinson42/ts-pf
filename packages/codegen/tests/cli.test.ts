import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { catalogHash, emit } from '@ts-pf/codegen'
import { describe, expect, it } from 'vitest'
import { type CliIo, runCli } from '../src/cli.js'
import { planetCatalog } from './planet-catalog.js'

function memoryIo(opts: {
  files?: Map<string, string>
  stdin?: string
  fetch?: typeof fetch
}): { io: CliIo; stdout: string; stderr: string } {
  const files = opts.files ?? new Map<string, string>()
  let stdout = ''
  let stderr = ''
  const io: CliIo = {
    stdin: { read: async () => opts.stdin ?? '' },
    stdout: {
      write: (chunk) => {
        stdout += chunk
      },
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk
      },
    },
    readFile: async (path) => {
      const value = files.get(path)
      if (value === undefined) {
        throw new Error(`ENOENT: ${path}`)
      }
      return value
    },
    writeFile: async (path, content) => {
      files.set(path, content)
    },
    fetch: opts.fetch ?? fetch,
  }
  return {
    io,
    get stdout() {
      return stdout
    },
    get stderr() {
      return stderr
    },
  }
}

describe('ts-pf-codegen CLI', () => {
  const spec = planetCatalog()
  const raw = JSON.stringify(spec)

  it('emit writes a .d.ts from a catalog file', async () => {
    const files = new Map<string, string>([['catalog.json', raw]])
    const box = memoryIo({ files })
    const code = await runCli(
      ['emit', 'catalog.json', '-o', 'contract.d.ts'],
      box.io,
    )
    expect(code).toBe(0)
    expect(files.get('contract.d.ts')).toBe(emit(spec))
  })

  it('emit reads stdin and honors --name / --fail-on-unavailable', async () => {
    const box = memoryIo({ stdin: raw })
    const code = await runCli(
      ['emit', '-', '--name', 'Api', '--fail-on-unavailable'],
      box.io,
    )
    expect(code).toBe(0)
    expect(box.stdout).toBe(
      emit(spec, { name: 'Api', failOnUnavailable: true }),
    )
  })

  it('hash prints sha256', async () => {
    const box = memoryIo({ files: new Map([['catalog.json', raw]]) })
    const code = await runCli(['hash', 'catalog.json'], box.io)
    expect(code).toBe(0)
    expect(box.stdout).toBe(`${catalogHash(spec)}\n`)
  })

  it('pull fetches JSON, emits, and writes a lockfile', async () => {
    const files = new Map<string, string>()
    const box = memoryIo({
      files,
      fetch: async () => new Response(raw, { status: 200 }),
    })
    const code = await runCli(
      [
        'pull',
        'https://api.example.com/catalog.json',
        '-o',
        'contract.d.ts',
        '--lock',
        'catalog.lock.json',
      ],
      box.io,
    )
    expect(code).toBe(0)
    expect(files.get('contract.d.ts')).toBe(emit(spec))
    expect(JSON.parse(files.get('catalog.lock.json') ?? '{}')).toEqual({
      url: 'https://api.example.com/catalog.json',
      catalogVersion: 1,
      catalogHash: catalogHash(spec),
    })
  })

  it('pull verifies an existing lockfile hash', async () => {
    const lock = {
      url: 'https://api.example.com/catalog.json',
      catalogVersion: 1,
      catalogHash: catalogHash(spec),
    }
    const files = new Map<string, string>([
      ['catalog.lock.json', JSON.stringify(lock)],
    ])
    const box = memoryIo({
      files,
      fetch: async () => new Response(raw, { status: 200 }),
    })
    const code = await runCli(
      [
        'pull',
        'https://api.example.com/catalog.json',
        '--lock',
        'catalog.lock.json',
      ],
      box.io,
    )
    expect(code).toBe(0)
    expect(box.stdout).toBe(emit(spec))
  })

  it('pull exits non-zero on hash mismatch', async () => {
    const files = new Map<string, string>([
      [
        'catalog.lock.json',
        JSON.stringify({
          url: 'https://api.example.com/catalog.json',
          catalogVersion: 1,
          catalogHash: 'sha256:deadbeef',
        }),
      ],
    ])
    const box = memoryIo({
      files,
      fetch: async () => new Response(raw, { status: 200 }),
    })
    const code = await runCli(
      [
        'pull',
        'https://api.example.com/catalog.json',
        '--lock',
        'catalog.lock.json',
      ],
      box.io,
    )
    expect(code).toBe(1)
    expect(box.stderr).toMatch(/hash mismatch/)
  })

  it('writes real temp files for emit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ts-pf-codegen-'))
    const catalogPath = join(dir, 'catalog.json')
    const outPath = join(dir, 'contract.d.ts')
    await writeFile(catalogPath, raw)
    const box = memoryIo({})
    const realIo: CliIo = {
      ...box.io,
      readFile: (path) => readFile(path, 'utf8'),
      writeFile: (path, content) => writeFile(path, content, 'utf8'),
    }
    const code = await runCli(['emit', catalogPath, '-o', outPath], realIo)
    expect(code).toBe(0)
    expect(await readFile(outPath, 'utf8')).toBe(emit(spec))
  })
})
