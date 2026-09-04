#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  stderr as nodeStderr,
  stdin as nodeStdin,
  stdout as nodeStdout,
} from 'node:process'
import { fileURLToPath } from 'node:url'
import type { ProcedureCatalog } from '@ts-pf/docs'
import { emit } from './emit.js'
import { catalogHash } from './hash.js'

export type CliIo = {
  stdin: { read: () => Promise<string> }
  stdout: { write: (chunk: string) => void }
  stderr: { write: (chunk: string) => void }
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  fetch: typeof fetch
}

const USAGE =
  'Usage: ts-pf-codegen <emit|pull|hash> …\n' +
  '  ts-pf-codegen emit <catalog.json> [-o contract.d.ts] [--name Contract] [--fail-on-unavailable]\n' +
  '  ts-pf-codegen pull <url> [-o contract.d.ts] [--lock catalog.lock.json]\n' +
  '  ts-pf-codegen hash <catalog.json>\n'

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [cmd, ...rest] = argv
  if (cmd === 'emit') {
    return emitCmd(rest, io)
  }
  if (cmd === 'pull') {
    return pullCmd(rest, io)
  }
  if (cmd === 'hash') {
    return hashCmd(rest, io)
  }
  io.stderr.write(USAGE)
  return 1
}

async function emitCmd(args: string[], io: CliIo): Promise<number> {
  const parsed = parseArgs(args, {
    flags: new Set(['fail-on-unavailable']),
    values: new Set(['o', 'name']),
  })
  const input = parsed.positional[0]
  if (input === undefined) {
    io.stderr.write('emit: missing catalog path (use - for stdin)\n')
    return 1
  }
  const raw = await readInput(input, io)
  const catalog = parseCatalog(raw)
  const name =
    typeof parsed.values.name === 'string' ? parsed.values.name : undefined
  const dts = emit(catalog, {
    ...(name !== undefined ? { name } : {}),
    failOnUnavailable: parsed.flags.has('fail-on-unavailable'),
  })
  return writeOutput(dts, parsed.values.o, io)
}

async function pullCmd(args: string[], io: CliIo): Promise<number> {
  const parsed = parseArgs(args, {
    flags: new Set(),
    values: new Set(['o', 'lock']),
  })
  const url = parsed.positional[0]
  if (url === undefined) {
    io.stderr.write('pull: missing catalog url\n')
    return 1
  }
  const response = await io.fetch(url)
  if (!response.ok) {
    io.stderr.write(`pull: GET ${url} failed (${String(response.status)})\n`)
    return 1
  }
  const raw = await response.text()
  const catalog = parseCatalog(raw)
  const hash = catalogHash(catalog)
  const lockPath = parsed.values.lock
  if (typeof lockPath === 'string') {
    let existing: string | undefined
    try {
      existing = await io.readFile(lockPath)
    } catch {
      existing = undefined
    }
    if (existing !== undefined) {
      const lock = parseLock(existing)
      if (lock.catalogHash !== hash) {
        io.stderr.write(
          `pull: catalog hash mismatch\n  lock: ${lock.catalogHash}\n  got:  ${hash}\n`,
        )
        return 1
      }
    } else {
      const lock = {
        url,
        catalogVersion: catalog.catalogVersion,
        catalogHash: hash,
      }
      await io.writeFile(`${lockPath}`, `${JSON.stringify(lock, null, 2)}\n`)
    }
  }
  const dts = emit(catalog)
  return writeOutput(dts, parsed.values.o, io)
}

async function hashCmd(args: string[], io: CliIo): Promise<number> {
  const parsed = parseArgs(args, { flags: new Set(), values: new Set() })
  const input = parsed.positional[0]
  if (input === undefined) {
    io.stderr.write('hash: missing catalog path (use - for stdin)\n')
    return 1
  }
  const raw = await readInput(input, io)
  const catalog = parseCatalog(raw)
  io.stdout.write(`${catalogHash(catalog)}\n`)
  return 0
}

async function readInput(path: string, io: CliIo): Promise<string> {
  if (path === '-') {
    return io.stdin.read()
  }
  return io.readFile(path)
}

async function writeOutput(
  content: string,
  output: string | boolean | undefined,
  io: CliIo,
): Promise<number> {
  if (typeof output === 'string') {
    await io.writeFile(output, content)
    return 0
  }
  io.stdout.write(content)
  return 0
}

function parseCatalog(raw: string): ProcedureCatalog {
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON'
    throw new Error(`catalog is not JSON: ${message}`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('catalog must be a JSON object')
  }
  return value as ProcedureCatalog
}

function parseLock(raw: string): { catalogHash: string } {
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    throw new Error('lockfile is not JSON')
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('catalogHash' in value) ||
    typeof (value as { catalogHash: unknown }).catalogHash !== 'string'
  ) {
    throw new Error('lockfile missing catalogHash')
  }
  return { catalogHash: (value as { catalogHash: string }).catalogHash }
}

function parseArgs(
  args: string[],
  spec: { flags: Set<string>; values: Set<string> },
): {
  positional: string[]
  flags: Set<string>
  values: Record<string, string>
} {
  const positional: string[] = []
  const flags = new Set<string>()
  const values: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined) {
      continue
    }
    if (arg === '--') {
      positional.push(...args.slice(i + 1))
      break
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
      if (spec.flags.has(name)) {
        flags.add(name)
        continue
      }
      if (spec.values.has(name)) {
        const value = eq === -1 ? args[++i] : arg.slice(eq + 1)
        if (value === undefined) {
          throw new Error(`missing value for --${name}`)
        }
        values[name] = value
        continue
      }
      throw new Error(`unknown option --${name}`)
    }
    if (arg === '-o') {
      const value = args[++i]
      if (value === undefined) {
        throw new Error('missing value for -o')
      }
      values.o = value
      continue
    }
    if (arg.startsWith('-') && arg !== '-') {
      throw new Error(`unknown option ${arg}`)
    }
    positional.push(arg)
  }
  return { positional, flags, values }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of nodeStdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function isMain(): boolean {
  const argv1 = process.argv[1]
  if (argv1 === undefined) {
    return false
  }
  try {
    return fileURLToPath(import.meta.url) === resolve(argv1)
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const io: CliIo = {
    stdin: { read: readStdin },
    stdout: { write: (chunk) => nodeStdout.write(chunk) },
    stderr: { write: (chunk) => nodeStderr.write(chunk) },
    readFile: (path) => readFile(path, 'utf8'),
    writeFile: (path, content) => writeFile(path, content, 'utf8'),
    fetch,
  }
  try {
    process.exitCode = await runCli(process.argv.slice(2), io)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    nodeStderr.write(`${message}\n`)
    process.exitCode = 1
  }
}

if (isMain()) {
  void main()
}
