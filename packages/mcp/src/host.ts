import type { BoundTool } from './bound-tool.js'
import type { Effect } from './meta.js'
import {
  discoverToolName,
  dispatchToolName,
  type HostBucket,
  hostScope,
} from './names.js'
import { errorResult, successResult } from './result.js'
import { createSearchIndex } from './search.js'
import { aliasesOf, descriptionOf, effectOf, tagsOf } from './tool-meta.js'
import type { HostSpec } from './toolset.js'
import type {
  McpCallInfo,
  McpToolAnnotations,
  McpToolDefinition,
  McpToolResult,
} from './types.js'

/** A listed MCP tool and how to run it. */
export type ToolEntry = {
  readonly definition: McpToolDefinition
  invoke(args: unknown, info: McpCallInfo): Promise<McpToolResult>
}

type Invoke = (
  tool: BoundTool,
  args: unknown,
  info: McpCallInfo,
) => Promise<McpToolResult>

type Inner = {
  tool: BoundTool
  effect: Effect
  description: string
  category: string | undefined
}

type Detail = 'name' | 'summary' | 'full'
type DiscoverArgs = {
  query?: string
  category?: string
  names?: string[]
  detail?: Detail
  limit?: number
}

/** Descriptions list inner names up to this many, otherwise categories. */
const LIST_NAMES_MAX = 30
/** `call_*` advertises `name` as an enum up to this many, otherwise a plain string. */
const NAME_ENUM_MAX = 100
const DEFAULT_LIMIT = 5

/** Segment-wise common prefix of the inner procedure paths: the host's node. */
function commonPrefix(paths: readonly string[][]): string[] {
  const [first, ...rest] = paths
  if (!first) return []
  let length = first.length
  for (const path of rest) {
    let i = 0
    while (i < length && path[i] === first[i]) i += 1
    length = i
  }
  return first.slice(0, length)
}

/** The first path segment under the host node, when the tool sits below one. */
function categories(tools: readonly BoundTool[]): (string | undefined)[] {
  const paths = tools.map((tool) =>
    tool.spec.path ? tool.spec.path.split('.') : [],
  )
  const prefix = commonPrefix(paths.filter((path) => path.length > 0))
  return paths.map((path) =>
    path.length > prefix.length + 1 ? path[prefix.length] : undefined,
  )
}

function dispatchAnnotations(inner: readonly Inner[]): McpToolAnnotations {
  if (inner.every((t) => t.effect === 'read')) return { readOnlyHint: true }
  return {
    readOnlyHint: false,
    destructiveHint: inner.some((t) => t.effect === 'destructive'),
  }
}

function strongestEffect(inner: readonly Inner[]): Effect {
  if (inner.some((t) => t.effect === 'destructive')) return 'destructive'
  return inner.some((t) => t.effect === 'write') ? 'write' : 'read'
}

function invalidDiscover(name: string, message: string, max: number) {
  return errorResult(`Invalid input for ${name}: ${message}`, max)
}

/** Lenient check of discovery arguments (the schema is advertised, never enforced by the SDK). */
function readDiscoverArgs(args: unknown): DiscoverArgs | string {
  if (args === undefined || args === null) return {}
  if (typeof args !== 'object' || Array.isArray(args))
    return 'expected an object'
  const a = args as Record<string, unknown>
  if (a.query !== undefined && typeof a.query !== 'string')
    return 'query must be a string'
  if (a.category !== undefined && typeof a.category !== 'string')
    return 'category must be a string'
  if (
    a.names !== undefined &&
    !(Array.isArray(a.names) && a.names.every((n) => typeof n === 'string'))
  )
    return 'names must be an array of strings'
  if (
    a.detail !== undefined &&
    a.detail !== 'name' &&
    a.detail !== 'summary' &&
    a.detail !== 'full'
  )
    return 'detail must be "name", "summary", or "full"'
  if (
    a.limit !== undefined &&
    !(Number.isInteger(a.limit) && (a.limit as number) >= 1)
  )
    return 'limit must be a positive integer'
  return a as DiscoverArgs
}

function describeInner(t: Inner, detail: Detail): Record<string, unknown> {
  if (detail === 'name') return { name: t.tool.name }
  const out: Record<string, unknown> = {
    name: t.tool.name,
    description: t.description,
    effect: t.effect,
  }
  if (t.category) out.category = t.category
  if (detail === 'full') {
    out.inputSchema = t.tool.inputSchema
    if (t.tool.spec.examples.length > 0) out.examples = t.tool.spec.examples
  }
  return out
}

function bucketEntries(
  key: string,
  bucket: HostBucket | undefined,
  host: HostSpec,
  inner: readonly Inner[],
  invoke: Invoke,
  maxChars: number,
): ToolEntry[] {
  const scope = hostScope(key, bucket)
  const getName = discoverToolName(scope)
  const callName = dispatchToolName(scope)
  const names = inner.map((t) => t.tool.name)
  const byName = new Map(inner.map((t) => [t.tool.name, t]))
  const cats = [
    ...new Set(inner.flatMap((t) => (t.category ? [t.category] : []))),
  ].sort()
  const index = createSearchIndex(
    inner.map((t) => ({
      id: t.tool.name,
      text: [
        t.tool.name,
        t.description,
        ...tagsOf(t.tool.spec),
        ...aliasesOf(t.tool.spec),
        t.category ?? '',
      ].join(' '),
    })),
  )
  const kind = bucket === 'query' ? 'read-only ' : ''
  const catalog =
    inner.length <= LIST_NAMES_MAX || cats.length === 0
      ? `Capabilities: ${names.join(', ')}.`
      : `Categories: ${cats.join(', ')}.`

  const discover: ToolEntry = {
    definition: {
      name: getName,
      description: `${host.description}\nSearch these ${inner.length} ${kind}capabilities, then run one with ${callName}. ${catalog}`,
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Words to rank capabilities by.',
          },
          ...(cats.length > 0
            ? { category: { type: 'string', enum: cats } }
            : {}),
          names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exact capability names.',
          },
          detail: {
            type: 'string',
            enum: ['name', 'summary', 'full'],
            description: '"full" adds the input schema and examples.',
          },
          limit: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      effect: 'read',
    },
    async invoke(args) {
      const parsed = readDiscoverArgs(args)
      if (typeof parsed === 'string') {
        return invalidDiscover(getName, parsed, maxChars)
      }
      let matches = parsed.names
        ? parsed.names.flatMap((name) => byName.get(name) ?? [])
        : [...inner]
      if (parsed.category !== undefined) {
        matches = matches.filter((t) => t.category === parsed.category)
      }
      if (parsed.query) {
        const allowed = new Set(matches)
        matches = index
          .search(parsed.query)
          .flatMap((name) => byName.get(name) ?? [])
          .filter((t) => allowed.has(t))
      }
      if (!parsed.names)
        matches = matches.slice(0, parsed.limit ?? DEFAULT_LIMIT)
      const detail = parsed.detail ?? 'summary'
      const result: Record<string, unknown> = {
        scope,
        total: inner.length,
        categories: cats,
        tools: matches.map((t) => describeInner(t, detail)),
      }
      const unknown = parsed.names?.filter((name) => !byName.has(name)) ?? []
      if (unknown.length > 0) result.unknown = unknown
      return successResult(result, maxChars, false)
    },
  }

  const dispatch: ToolEntry = {
    definition: {
      name: callName,
      description: `Run one ${kind}${scope} capability by name. Find names and input schemas with ${getName}.`,
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            ...(names.length <= NAME_ENUM_MAX ? { enum: names } : {}),
          },
          input: {
            type: 'object',
            description: `The capability input (see ${getName} with detail "full").`,
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
      annotations: dispatchAnnotations(inner),
      effect: strongestEffect(inner),
    },
    async invoke(args, info) {
      const name = (args as { name?: unknown } | undefined)?.name
      const target = typeof name === 'string' ? byName.get(name) : undefined
      if (!target) {
        return errorResult(
          `Unknown capability ${JSON.stringify(name)}. Valid: ${names.join(', ')}`,
          maxChars,
        )
      }
      return invoke(target.tool, (args as { input?: unknown }).input, info)
    },
  }
  return [discover, dispatch]
}

/** The `get_*_capabilities` / `call_*_capability` pairs of one host; empty buckets list nothing. */
export function hostEntries(
  key: string,
  host: HostSpec,
  tools: readonly BoundTool[],
  invoke: Invoke,
  maxChars: number,
): ToolEntry[] {
  const cats = categories(tools)
  const inner: Inner[] = tools.map((tool, i) => ({
    tool,
    effect: effectOf(tool.spec),
    description: descriptionOf(tool.spec),
    category: cats[i],
  }))
  const buckets: [HostBucket | undefined, Inner[]][] =
    host.split === 'effect'
      ? [
          ['query', inner.filter((t) => t.effect === 'read')],
          ['operations', inner.filter((t) => t.effect !== 'read')],
        ]
      : [[undefined, inner]]
  return buckets
    .filter(([, list]) => list.length > 0)
    .flatMap(([bucket, list]) =>
      bucketEntries(key, bucket, host, list, invoke, maxChars),
    )
}
