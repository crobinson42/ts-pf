import { execFile } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { catalogHash, diffCatalog, emit, emitFiles } from '@ts-pf/codegen'
import { procedure } from '@ts-pf/contract'
import { catalog } from '@ts-pf/docs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { type CliIo, readOutDir, runCli } from '../src/cli.js'
import { planetCatalog, planetContract } from './planet-catalog.js'

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
    readDir: async (dir) => {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`
      const found: string[] = []
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          found.push(key.slice(prefix.length))
        }
      }
      return found
    },
    removeFile: async (path) => {
      files.delete(path)
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

const execFileAsync = promisify(execFile)
const distCli = fileURLToPath(new URL('../dist/cli.js', import.meta.url))

describe('ts-pf-codegen CLI', () => {
  const spec = planetCatalog()
  const raw = JSON.stringify(spec)

  it.each(['--help', '-h'])('%s prints usage and exits 0', async (flag) => {
    const box = memoryIo({})
    const code = await runCli([flag], box.io)
    expect(code).toBe(0)
    expect(box.stdout).toMatch(/^Usage: ts-pf-codegen/)
    expect(box.stdout).toMatch(/--help/)
    expect(box.stdout).toMatch(/--out-dir/)
    expect(box.stdout).toMatch(/diff <previous\.json> <next\.json>/)
    expect(box.stderr).toBe('')
  })

  it('no command prints usage to stderr and exits 1', async () => {
    const box = memoryIo({})
    const code = await runCli([], box.io)
    expect(code).toBe(1)
    expect(box.stdout).toBe('')
    expect(box.stderr).toMatch(/^Usage: ts-pf-codegen/)
  })

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

  it('runs through a node_modules/.bin style symlink (npx / npm scripts)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ts-pf-codegen-bin-'))
    const link = join(dir, 'ts-pf-codegen')
    await symlink(distCli, link)
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      link,
      '--help',
    ])
    expect(stdout).toMatch(/^Usage: ts-pf-codegen/)
    expect(stderr).toBe('')
  })

  it('emit --out-dir writes the split files and deletes a stale .d.ts', async () => {
    const files = new Map<string, string>([
      ['catalog.json', raw],
      ['generated/old.d.ts', 'stale\n'],
    ])
    const box = memoryIo({ files })
    const code = await runCli(
      ['emit', 'catalog.json', '--out-dir', 'generated'],
      box.io,
    )
    expect(code).toBe(0)
    expect(files.has('generated/old.d.ts')).toBe(false)
    for (const file of emitFiles(spec)) {
      expect(files.get(`generated/${file.path}`)).toBe(file.contents)
    }
  })

  it('emit refuses -o together with --out-dir', async () => {
    const files = new Map<string, string>([['catalog.json', raw]])
    const box = memoryIo({ files })
    const code = await runCli(
      ['emit', 'catalog.json', '-o', 'contract.d.ts', '--out-dir', 'generated'],
      box.io,
    )
    expect(code).toBe(1)
    expect(box.stderr).toMatch(/not both/)
    expect(files.has('contract.d.ts')).toBe(false)
  })

  it('emit --out-dir refuses a non-d.ts file and writes nothing', async () => {
    const files = new Map<string, string>([
      ['catalog.json', raw],
      ['generated/notes.txt', 'keep\n'],
    ])
    const box = memoryIo({ files })
    const code = await runCli(
      ['emit', 'catalog.json', '--out-dir', 'generated'],
      box.io,
    )
    expect(code).toBe(1)
    expect(box.stderr).toMatch(/non-d\.ts file: notes\.txt/)
    expect(files.get('generated/notes.txt')).toBe('keep\n')
    expect(files.has('generated/contract.d.ts')).toBe(false)
  })

  it('pull --out-dir writes files and a lock', async () => {
    const files = new Map<string, string>()
    const box = memoryIo({
      files,
      fetch: async () => new Response(raw, { status: 200 }),
    })
    const code = await runCli(
      [
        'pull',
        'https://api.example.com/catalog.json',
        '--out-dir',
        'generated',
        '--lock',
        'catalog.lock.json',
      ],
      box.io,
    )
    expect(code).toBe(0)
    expect(files.get('generated/contract.d.ts')).toBe(
      emitFiles(spec)[0]?.contents,
    )
    expect(JSON.parse(files.get('catalog.lock.json') ?? '{}')).toEqual({
      url: 'https://api.example.com/catalog.json',
      catalogVersion: 1,
      catalogHash: catalogHash(spec),
    })
  })

  it('emit --out-dir writes a real directory and deletes a stale .d.ts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ts-pf-codegen-dir-'))
    const catalogPath = join(dir, 'catalog.json')
    const outDir = join(dir, 'generated')
    await writeFile(catalogPath, raw)
    await mkdir(outDir)
    await writeFile(join(outDir, 'old.d.ts'), 'stale\n')
    const box = memoryIo({})
    const realIo: CliIo = {
      ...box.io,
      readFile: (path) => readFile(path, 'utf8'),
      writeFile: async (path, content) => {
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, content)
      },
      readDir: readOutDir,
      removeFile: (path) => unlink(path),
    }
    const code = await runCli(
      ['emit', catalogPath, '--out-dir', outDir],
      realIo,
    )
    expect(code).toBe(0)
    const sort = (paths: string[]) =>
      paths.sort((a, b) => a.localeCompare(b, 'en'))
    expect(sort(await readOutDir(outDir))).toEqual(
      sort(emitFiles(spec).map((file) => file.path)),
    )
    await expect(readFile(join(outDir, 'old.d.ts'), 'utf8')).rejects.toThrow()
  })

  it('emits through the symlinked bin', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ts-pf-codegen-bin-'))
    const link = join(dir, 'ts-pf-codegen')
    const catalogPath = join(dir, 'catalog.json')
    await symlink(distCli, link)
    await writeFile(catalogPath, raw)
    const { stdout } = await execFileAsync(process.execPath, [
      link,
      'emit',
      catalogPath,
    ])
    expect(stdout).toBe(emit(spec))
  })
  describe('diff', () => {
    // planet/moon is added (safe). Then planet/find gains a required input
    // property and planet/list is removed (both breaking).
    const { find, list, chat } = planetContract.planet
    const write = (procedures: Record<string, unknown>) =>
      JSON.stringify(catalog({ planet: procedures }, { prefix: '/rpc' }))
    const addedRaw = write({ find, list, chat, moon: list })
    const nextSpec = catalog(
      {
        planet: {
          find: procedure
            .input(z.object({ id: z.number(), system: z.string() }))
            .output(z.object({ id: z.number(), name: z.string() }))
            .errors({
              NOT_FOUND: { status: 404, data: z.object({ id: z.number() }) },
            }),
          chat,
          moon: list,
        },
      },
      { prefix: '/rpc' },
    )
    const nextRaw = JSON.stringify(nextSpec)
    const files = () =>
      new Map<string, string>([
        ['old.json', raw],
        ['added.json', addedRaw],
        ['new.json', nextRaw],
      ])

    it('exits 0 with "No changes." for identical catalogs', async () => {
      const box = memoryIo({ files: files() })
      const code = await runCli(['diff', 'old.json', 'old.json'], box.io)
      expect(code).toBe(0)
      expect(box.stdout).toBe('No changes.\n')
    })

    it('exits 0 and lists safe changes', async () => {
      const box = memoryIo({ files: files() })
      const code = await runCli(['diff', 'old.json', 'added.json'], box.io)
      expect(code).toBe(0)
      expect(box.stdout).toBe(
        'Safe changes (1):\n  planet/moon: procedure added\n',
      )
    })

    it('exits 2 on breaking changes and prints both sections', async () => {
      const box = memoryIo({ files: files() })
      const code = await runCli(['diff', 'old.json', 'new.json'], box.io)
      expect(code).toBe(2)
      expect(box.stdout).toBe(
        'Breaking changes (2):\n' +
          '  planet/find /input/properties/system: input: required property "system" added\n' +
          '  planet/list: procedure removed\n' +
          'Safe changes (1):\n' +
          '  planet/moon: procedure added\n',
      )
      expect(box.stderr).toBe('')
    })

    it('--json prints the CatalogDiff and keeps exit 2', async () => {
      const box = memoryIo({ files: files() })
      const code = await runCli(
        ['diff', 'old.json', 'new.json', '--json'],
        box.io,
      )
      expect(code).toBe(2)
      expect(JSON.parse(box.stdout)).toEqual(diffCatalog(spec, nextSpec))
    })

    it('reads one side from stdin', async () => {
      const box = memoryIo({ files: files(), stdin: nextRaw })
      expect(await runCli(['diff', 'old.json', '-'], box.io)).toBe(2)
    })

    it('exits 1 on missing arguments or a non-catalog file', async () => {
      const missing = memoryIo({ files: files() })
      expect(await runCli(['diff', 'old.json'], missing.io)).toBe(1)
      expect(missing.stderr).toMatch(/expected <previous\.json> <next\.json>/)

      const bad = memoryIo({
        files: new Map([
          ['old.json', raw],
          ['bad.json', '{"hello":1}'],
        ]),
      })
      expect(await runCli(['diff', 'old.json', 'bad.json'], bad.io)).toBe(1)
      expect(bad.stderr).toMatch(/bad\.json is not a catalog\(\) document/)
    })

    it('throws on unreadable files (the bin maps it to exit 1)', async () => {
      const box = memoryIo({ files: files() })
      await expect(
        runCli(['diff', 'old.json', 'missing.json'], box.io),
      ).rejects.toThrow(/ENOENT/)
    })

    it('the bin exits 2 on breaking changes and 1 on IO errors', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'ts-pf-codegen-diff-'))
      const link = join(dir, 'ts-pf-codegen')
      await symlink(distCli, link)
      await writeFile(join(dir, 'old.json'), raw)
      await writeFile(join(dir, 'new.json'), nextRaw)
      await expect(
        execFileAsync(process.execPath, [
          link,
          'diff',
          join(dir, 'old.json'),
          join(dir, 'new.json'),
        ]),
      ).rejects.toMatchObject({ code: 2 })
      await expect(
        execFileAsync(process.execPath, [
          link,
          'diff',
          join(dir, 'old.json'),
          join(dir, 'missing.json'),
        ]),
      ).rejects.toMatchObject({ code: 1 })
    })
  })
})
