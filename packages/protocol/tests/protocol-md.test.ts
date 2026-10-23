import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PROTOCOL_MAJOR,
  PROTOCOL_VERSION,
  ProtocolErrorCode,
} from '@ts-pf/protocol'
import { describe, expect, it } from 'vitest'

const specPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'PROTOCOL.md',
)

// Rows of the "## Protocol errors" table: | `CODE` | <status> | ... |
function protocolErrorRows(markdown: string): Array<[string, number]> {
  const start = markdown.indexOf('\n## Protocol errors\n')
  if (start === -1) {
    throw new Error('PROTOCOL.md has no "## Protocol errors" section')
  }
  const rest = markdown.slice(start + 1)
  const nextHeading = rest.indexOf('\n## ', 1)
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading)
  const rows: Array<[string, number]> = []
  for (const line of section.split('\n')) {
    const match = /^\| `([A-Z][A-Z_]*)` \| (\d{3}) \|/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) {
      rows.push([match[1], Number(match[2])])
    }
  }
  return rows
}

describe('PROTOCOL.md protocol errors table', () => {
  it('lists exactly the closed ProtocolErrorCode set', () => {
    const rows = protocolErrorRows(readFileSync(specPath, 'utf8'))
    expect(rows.map(([code]) => code).sort()).toEqual(
      Object.values(ProtocolErrorCode).sort(),
    )
  })
})

describe('PROTOCOL.md wire version', () => {
  const markdown = readFileSync(specPath, 'utf8')

  it('writes PROTOCOL_VERSION in every x-ts-pf-protocol header example', () => {
    const values = [...markdown.matchAll(/x-ts-pf-protocol: "?(\d[\d.]*)/g)]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined)
    expect(values.length).toBeGreaterThan(0)
    expect(new Set(values)).toEqual(new Set([PROTOCOL_VERSION]))
  })

  it('writes PROTOCOL_MAJOR in every "v" frame example', () => {
    const values = [...markdown.matchAll(/"v": (\d+(?:\.\d+)?)/g)]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined)
    expect(values.length).toBeGreaterThan(0)
    expect(new Set(values)).toEqual(new Set([String(PROTOCOL_MAJOR)]))
  })
})
