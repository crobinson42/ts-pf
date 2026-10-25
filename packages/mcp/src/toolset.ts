import { defined } from '@ts-pf/protocol'
import type { KeysOfUnion } from './infer.js'
import {
  discoverToolName,
  dispatchToolName,
  type HostToolNames,
  hostScope,
  type Split,
} from './names.js'
import {
  type AnyTool,
  isTool,
  type ToolSpec,
  toolSpec,
  type Visibility,
} from './tool.js'

export type ToolRecord<Ctx = never> = { readonly [name: string]: AnyTool<Ctx> }
export type ToolsInput<Ctx = never> =
  | ToolRecord<Ctx>
  | readonly ToolRecord<Ctx>[]

type Dups<L> = L extends readonly [infer H, ...infer R]
  ? (keyof H & KeysOfUnion<R[number]>) | Dups<R>
  : never
type RecordsOf<Tools> = Tools extends readonly unknown[] ? Tools[number] : Tools
export type PathsOf<Tools> =
  RecordsOf<Tools> extends infer R
    ? R extends unknown
      ? R[keyof R] extends infer V
        ? V extends { readonly '~tool': { path: infer P } }
          ? P
          : never
        : never
      : never
    : never

type NameMsg<K, Taken> = K extends Taken
  ? `Tool name "${K & string}" collides with a generated host tool name`
  : `Duplicate tool name "${K & string}"`
type NameProblems<
  Tools,
  Taken extends string,
> = Tools extends readonly unknown[]
  ? Dups<Tools> | (KeysOfUnion<Tools[number]> & Taken)
  : keyof Tools & Taken

/**
 * Marks each offending key in each record with a message literal (the
 * `RouterImplCheck` trick). `unknown` when nothing collides, so `Tools &
 * NameCheck` stays `Tools`: intersecting a tuple with a mapped tuple makes the
 * checker compare array methods structurally, which costs ~1.6M instantiations
 * on a 400-procedure `all()`.
 */
export type NameCheck<Tools, Taken extends string> = [
  NameProblems<Tools, Taken>,
] extends [never]
  ? unknown
  : NameMarks<Tools, Taken>

type NameMarks<Tools, Taken extends string> = Tools extends readonly unknown[]
  ? {
      [I in keyof Tools]: {
        [K in keyof Tools[I] & (Dups<Tools> | Taken)]: NameMsg<K, Taken>
      }
    }
  : { [K in keyof Tools & Taken]: NameMsg<K, Taken> }

/** Runtime description of a tool host; what `'~host'` holds. */
export type HostSpec = {
  readonly description: string
  readonly tools: Readonly<Record<string, ToolSpec>>
  readonly split: Split
  /** Hides the whole host; inner tools' own `visible` filters what it offers. */
  readonly visible?: Visibility
}

export interface Host<Ctx, Paths extends string, Sp extends Split> {
  readonly '~host': { ctx: (c: Ctx) => void; paths: Paths; split: Sp }
}

/** `never` context: any host is assignable. */
export type AnyHost<Sp extends Split = Split> = Host<never, string, Sp>

export type HostsNames<H> = {
  [K in keyof H & string]: H[K] extends AnyHost<infer Sp>
    ? HostToolNames<K, Sp>
    : never
}[keyof H & string]
export type HostsPaths<H> = {
  [K in keyof H]: H[K] extends Host<never, infer P, Split> ? P : never
}[keyof H]
export type HostsCheck<H> = {
  [K in keyof H & string]: H[K] extends AnyHost<infer Sp>
    ? [HostToolNames<K, Sp> & HostsNames<Omit<H, K>>] extends [never]
      ? unknown
      : {
          '~error': `Host "${K}" generates "${HostToolNames<K, Sp> & HostsNames<Omit<H, K>>}", which another host also generates`
        }
    : unknown
}

/** Runtime description of a toolset; what `'~toolset'` holds. */
export type ToolsetSpec = {
  readonly contract: unknown
  readonly tools: Readonly<Record<string, ToolSpec>>
  readonly hosts: Readonly<Record<string, HostSpec>>
}

export interface Toolset<T, Ctx, Paths extends string> {
  readonly '~toolset': { contract: T; ctx: (c: Ctx) => void; paths: Paths }
}

/** `unknown` contract and `never` context: any toolset is assignable. */
export type AnyToolset = Toolset<unknown, never, string>

export function hostSpec(host: AnyHost): HostSpec {
  return host['~host'] as unknown as HostSpec
}

export function toolsetSpec(toolset: AnyToolset): ToolsetSpec {
  return toolset['~toolset'] as unknown as ToolsetSpec
}

/** Flatten one record or a list of records; the object key is the tool name. */
function collectTools(input: unknown, where: string): Record<string, ToolSpec> {
  const records = (Array.isArray(input) ? input : [input ?? {}]) as Record<
    string,
    unknown
  >[]
  const tools: Record<string, ToolSpec> = {}
  for (const record of records) {
    for (const [name, tool] of Object.entries(record)) {
      if (!isTool(tool)) {
        throw new TypeError(`${where}: "${name}" is not a tool`)
      }
      if (Object.hasOwn(tools, name)) {
        throw new Error(`${where}: duplicate tool name "${name}"`)
      }
      tools[name] = toolSpec(tool)
    }
  }
  return tools
}

/** The MCP tool names a host lists (empty buckets are not listed, but their names stay reserved). */
export function hostToolNames(key: string, split: Split): string[] {
  const scopes =
    split === 'effect'
      ? [hostScope(key, 'query'), hostScope(key, 'operations')]
      : [hostScope(key, undefined)]
  return scopes.flatMap((scope) => [
    discoverToolName(scope),
    dispatchToolName(scope),
  ])
}

export function createHost(def: {
  description: string
  tools: unknown
  split?: Split
  visible?: Visibility
}): unknown {
  if (!def.description) {
    throw new TypeError('$host(): description is required')
  }
  const spec: HostSpec = {
    ...defined({ visible: def.visible }),
    description: def.description,
    tools: collectTools(def.tools, '$host()'),
    split: def.split ?? 'effect',
  }
  return { '~host': spec }
}

export function createToolset(
  contract: unknown,
  def: { tools?: unknown; hosts?: Record<string, unknown> },
): unknown {
  const tools = collectTools(def.tools, '$toolset()')
  const hosts: Record<string, HostSpec> = {}
  const taken = new Map<string, string>()
  for (const name of Object.keys(tools)) taken.set(name, `tool "${name}"`)
  for (const [key, host] of Object.entries(def.hosts ?? {})) {
    const spec = hostSpec(host as AnyHost)
    for (const name of hostToolNames(key, spec.split)) {
      const owner = taken.get(name)
      if (owner) {
        throw new Error(
          `$toolset(): host "${key}" generates "${name}", which ${owner} also uses`,
        )
      }
      taken.set(name, `host "${key}"`)
    }
    hosts[key] = spec
  }
  const spec: ToolsetSpec = { contract, tools, hosts }
  return { '~toolset': spec }
}
