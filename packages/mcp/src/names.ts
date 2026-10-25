import type { IsContractProcedure } from '@ts-pf/contract'
import type { Keys } from './infer.js'

/** `user.listActive` → `user_listActive`. */
export type ToolName<P extends string> = P extends `${infer A}.${infer B}`
  ? `${A}_${ToolName<B>}`
  : P

export function toolName(path: string): string {
  return path.replaceAll('.', '_')
}

export type Split = 'effect' | false

/** The MCP tools a host generates, from its key exactly. */
export type HostToolNames<K extends string, Sp> = Sp extends 'effect'
  ?
      | `get_${K}_query_capabilities`
      | `call_${K}_query_capability`
      | `get_${K}_operations_capabilities`
      | `call_${K}_operations_capability`
  : `get_${K}_capabilities` | `call_${K}_capability`

export type HostBucket = 'query' | 'operations'

/** `admin` + `query` → `admin_query`; unsplit hosts have one scope named by the key. */
export function hostScope(key: string, bucket: HostBucket | undefined): string {
  return bucket ? `${key}_${bucket}` : key
}

export function discoverToolName(scope: string): string {
  return `get_${scope}_capabilities`
}

export function dispatchToolName(scope: string): string {
  return `call_${scope}_capability`
}

type DollarPaths<T, P extends string = ''> = {
  [K in Keys<T>]: K extends `$${string}`
    ? `${P}${K}`
    : IsContractProcedure<T[K]> extends true
      ? never
      : DollarPaths<T[K], `${P}${K}.`>
}[Keys<T>]

/** `$` is reserved for toolkit root members, so a contract key starting with it is an error naming the key. */
export type DollarGuard<T> = [DollarPaths<T>] extends [never]
  ? unknown
  : {
      '~error': `Contract key "${DollarPaths<T>}" starts with "$", which createToolkit reserves for $context/$toolset/$host/$tool/$coverage. Rename it.`
    }
