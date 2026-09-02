import type { ProcedureCatalog } from '@ts-pf/docs'

export function toMarkdown(spec: ProcedureCatalog): string {
  const lines = ['# API', '']
  for (const proc of spec.procedures) {
    const href = proc.href ?? `/${proc.key}`
    lines.push(`## \`${proc.key}\``)
    lines.push('')
    lines.push(`\`POST ${href}\``)
    lines.push('')
    if (proc.docs?.description) {
      lines.push(proc.docs.description)
      lines.push('')
    }
    if (proc.errors.length > 0) {
      lines.push(`Errors: ${proc.errors.map((e) => e.code).join(', ')}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}
