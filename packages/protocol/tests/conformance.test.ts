import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROTOCOL_MAJOR, PROTOCOL_VERSION } from '@ts-pf/protocol'
import {
  httpConformance,
  httpStreamConformance,
  wsConformance,
} from '@ts-pf/protocol/conformance'
import { describe, expect, it } from 'vitest'

const markdown = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'PROTOCOL.md'),
  'utf8',
)

const files = [httpConformance, httpStreamConformance, wsConformance]
const httpCases = [...httpConformance.cases, ...httpStreamConformance.cases]
const allCases: Array<{ id: string; description: string }> = [
  ...httpCases,
  ...wsConformance.cases,
]

/** Section headings of PROTOCOL.md, without backticks: "First frame (client)". */
const headings = [...markdown.matchAll(/^#{2,4} (.+)$/gm)].map((match) =>
  (match[1] ?? '').replaceAll('`', ''),
)

/** "PROTOCOL.md: A; B, step 5." → ["A", "B"]. */
function citedSections(description: string): string[] {
  const cited = /PROTOCOL\.md: (.+)$/.exec(description)?.[1] ?? ''
  return cited
    .replace(/\.$/, '')
    .split('; ')
    .map((part) => part.replace(/, steps? [\d-]+$/, ''))
    .filter((part) => part.length > 0)
}

function isHeading(section: string): boolean {
  return headings.some(
    (heading) =>
      heading.startsWith(section) || section.startsWith(`${heading} (`),
  )
}

describe('conformance fixtures', () => {
  it('are versioned with the PROTOCOL.md revision and the wire major', () => {
    const revision = /^# .*\(revision (\d+\.\d+)\)$/m.exec(markdown)?.[1]
    expect(revision).toBeDefined()
    for (const file of files) {
      expect(file.revision).toBe(revision)
      expect(file.protocol).toBe(PROTOCOL_MAJOR)
    }
  })

  it('have unique case ids across all files', () => {
    const ids = allCases.map((testCase) => testCase.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cite PROTOCOL.md sections that exist', () => {
    for (const testCase of allCases) {
      const sections = citedSections(testCase.description)
      expect(sections, testCase.id).not.toEqual([])
      for (const section of sections) {
        expect(isHeading(section), `${testCase.id}: ${section}`).toBe(true)
      }
    }
  })

  it('expect every HTTP request to carry the protocol header', () => {
    for (const testCase of httpCases) {
      expect(testCase.expectRequest.headers['x-ts-pf-protocol']).toBe(
        PROTOCOL_VERSION,
      )
    }
  })
})
