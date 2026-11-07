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
import { catalogHash, emit, emitFiles } from '@ts-pf/codegen'
import { describe, expect, it } from 'vitest'
import { type CliIo, readOutDir, runCli } from '../src/cli.js'
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
})
