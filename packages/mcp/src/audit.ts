import { bindTool } from './bound-tool.js'
import { declaredEffect, effectOf } from './tool-meta.js'
import {
  type AnyToolset,
  type HostSpec,
  hostToolNames,
  toolsetSpec,
} from './toolset.js'

export type AuditFinding = {
  level: 'error' | 'warn'
  /** A tool name, or `toolset[i]` for a finding about a whole toolset. */
  tool: string
  message: string
}

export type AuditOptions = {
  /** Warn when a toolset lists more MCP tools than this. Default 15. */
  maxTools?: number
  /** Warn above this name length (a soft limit for Cursor; the spec allows 128). Default 60. */
  maxNameLength?: number
  /** Severity of an empty description. Default `'error'` (descriptions come from `docs()` first). */
  missingDescription?: 'error' | 'warn'
}

const MCP_NAME = /^[A-Za-z0-9_.-]{1,128}$/

/** Host tool names actually listed: buckets with no tools list nothing. */
function listedHostNames(key: string, host: HostSpec): string[] {
  if (host.split !== 'effect') return hostToolNames(key, false)
  const effects = Object.values(host.tools).map(effectOf)
  const [getQuery, callQuery, getOps, callOps] = hostToolNames(key, 'effect')
  return [
    ...(effects.includes('read') ? [getQuery, callQuery] : []),
    ...(effects.some((e) => e !== 'read') ? [getOps, callOps] : []),
  ].filter((name): name is string => name !== undefined)
}

/**
 * Runtime lint for CI: descriptions, classification, schema roots, toolset
 * size, and names. Coverage is `$coverage`'s job, not this one's.
 */
export function audit(
  toolsets: readonly AnyToolset[],
  options: AuditOptions = {},
): AuditFinding[] {
  const maxTools = options.maxTools ?? 15
  const maxNameLength = options.maxNameLength ?? 60
  const missingDescription = options.missingDescription ?? 'error'
  const findings: AuditFinding[] = []
  toolsets.forEach((toolset, index) => {
    const spec = toolsetSpec(toolset)
    const listed = [
      ...Object.keys(spec.tools),
      ...Object.entries(spec.hosts).flatMap(([key, host]) =>
        listedHostNames(key, host),
      ),
    ]
    if (listed.length > maxTools) {
      findings.push({
        level: 'warn',
        tool: `toolset[${index}]`,
        message: `lists ${listed.length} tools (more than ${maxTools}); split it or put a large group behind a $host`,
      })
    }
    for (const name of listed) {
      if (!MCP_NAME.test(name)) {
        findings.push({
          level: 'error',
          tool: name,
          message:
            'name must be 1-128 characters of A-Z, a-z, 0-9, "_", "-", "."',
        })
      } else if (name.length > maxNameLength) {
        findings.push({
          level: 'warn',
          tool: name,
          message: `name is ${name.length} characters (more than ${maxNameLength}); some clients cut or reject it`,
        })
      }
    }
    const tools = [
      ...Object.entries(spec.tools),
      ...Object.values(spec.hosts).flatMap((host) =>
        Object.entries(host.tools),
      ),
    ]
    for (const [name, toolSpec] of tools) {
      const bound = bindTool(name, toolSpec)
      if (bound.definition.description.trim() === '') {
        findings.push({
          level: missingDescription,
          tool: name,
          message:
            'no description; add docs({ description }) in the contract, mcp({ description }), or .describe()',
        })
      }
      if (toolSpec.procedure && declaredEffect(toolSpec) === undefined) {
        findings.push({
          level: 'warn',
          tool: name,
          message:
            'unclassified; treated as write. Add mcp({ effect }) in the contract or .effect()',
        })
      }
      for (const issue of bound.issues) {
        findings.push({
          level: issue.level,
          tool: name,
          message: issue.message,
        })
      }
    }
  })
  return findings
}
