import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ProtocolErrorCode } from '@ts-pf/protocol'
import { describe, expect, it } from 'vitest'
import { PROTOCOL_HTTP_STATUS } from '../src/index.js'

const specPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'protocol',
  'PROTOCOL.md',
)

// Rows of the "## Protocol errors" table: | `CODE` | <status> | ... |
function protocolErrorStatuses(markdown: string): Record<string, number> {
  const start = markdown.indexOf('\n## Protocol errors\n')
  if (start === -1) {
    throw new Error('PROTOCOL.md has no "## Protocol errors" section')
  }
  const rest = markdown.slice(start + 1)
  const nextHeading = rest.indexOf('\n## ', 1)
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading)
  const statuses: Record<string, number> = {}
  for (const line of section.split('\n')) {
    const match = /^\| `([A-Z][A-Z_]*)` \| (\d{3}) \|/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) {
      statuses[match[1]] = Number(match[2])
    }
  }
  return statuses
}

describe('PROTOCOL_HTTP_STATUS', () => {
  it('covers exactly the closed ProtocolErrorCode set', () => {
    expect(Object.keys(PROTOCOL_HTTP_STATUS).sort()).toEqual(
      Object.values(ProtocolErrorCode).sort(),
    )
  })

  it('matches the status column of the PROTOCOL.md errors table', () => {
    expect(protocolErrorStatuses(readFileSync(specPath, 'utf8'))).toEqual(
      PROTOCOL_HTTP_STATUS,
    )
  })
})
