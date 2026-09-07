import type { DocsMeta } from '@ts-pf/docs'

export function jsDocLines(docs: DocsMeta | undefined): string[] {
  if (docs == null || typeof docs !== 'object' || Array.isArray(docs)) {
    return []
  }

  const record = docs as Record<string, unknown>
  const summary = paragraph(record.summary)
  const description = paragraph(record.description)
  const deprecated = record.deprecated === true

  const body: string[] = []
  if (summary !== undefined && description !== undefined) {
    if (fieldText(record.summary) === fieldText(record.description)) {
      body.push(...summary)
    } else {
      body.push(...summary, '', ...description)
    }
  } else if (summary !== undefined) {
    body.push(...summary)
  } else if (description !== undefined) {
    body.push(...description)
  }

  if (body.length === 0 && !deprecated) {
    return []
  }

  const lines = ['/**']
  for (const line of body) {
    lines.push(line.length === 0 ? ' *' : ` * ${escapeJsDoc(line)}`)
  }
  if (deprecated) {
    if (body.length > 0) {
      lines.push(' *')
    }
    lines.push(' * @deprecated')
  }
  lines.push(' */')
  return lines
}

function fieldText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function paragraph(value: unknown): string[] | undefined {
  const text = fieldText(value)
  if (text === undefined) {
    return undefined
  }
  return text.split(/\r\n|\n/).map((line) => line.replace(/\s+$/, ''))
}

function escapeJsDoc(line: string): string {
  return line.replaceAll('*/', '*\\/')
}
