import type {
  CatalogError,
  CatalogProcedure,
  CatalogSchema,
  ProcedureCatalog,
} from '@ts-pf/docs'
import {
  type Direction,
  diffJsonSchema,
  type SchemaChangeKind,
} from './diff-schema.js'
import { escapePointer } from './schema-util.js'

export type CatalogChange = {
  kind:
    | 'protocol-changed'
    | 'procedure-added'
    | 'procedure-removed'
    | 'procedure-kind-changed'
    | 'schema-added'
    | 'schema-removed'
    | 'schema-availability-changed'
    | 'error-added'
    | 'error-removed'
    | 'error-status-changed'
    | 'deprecated'
    | SchemaChangeKind
  /** Procedure key (`planet/find`). Absent for catalog-level changes. */
  path?: string
  /**
   * Location inside the procedure entry: `/input` / `/output` (`/item` for a
   * stream item) / `/errors/<code>/data`, then the JSON Schema path
   * (`/input/properties/id`); or `/errors/<code>`, `/errors/<code>/status`,
   * `/docs/deprecated`. Catalog level: `/protocol/version`. Error codes are
   * JSON-pointer escaped.
   */
  pointer?: string
  message: string
}

export type CatalogDiff = {
  breaking: CatalogChange[]
  safe: CatalogChange[]
}

type Report = (change: CatalogChange, breaking: boolean) => void

/**
 * Breaking vs safe changes between two `catalog()` documents, from an old
 * client's point of view: inputs are what it sends, outputs and error `data`
 * are what it receives. Docs text is ignored.
 */
export function diffCatalog(
  previous: ProcedureCatalog,
  next: ProcedureCatalog,
): CatalogDiff {
  const diff: CatalogDiff = { breaking: [], safe: [] }
  const report: Report = (change, breaking) => {
    ;(breaking ? diff.breaking : diff.safe).push(change)
  }
  if (previous.protocol.version !== next.protocol.version) {
    report(
      {
        kind: 'protocol-changed',
        pointer: '/protocol/version',
        message: `protocol version ${previous.protocol.version} -> ${next.protocol.version}`,
      },
      true,
    )
  }
  const nextByKey = new Map(next.procedures.map((proc) => [proc.key, proc]))
  const previousKeys = new Set(previous.procedures.map((proc) => proc.key))
  for (const proc of previous.procedures) {
    const match = nextByKey.get(proc.key)
    if (match === undefined) {
      report(
        {
          kind: 'procedure-removed',
          path: proc.key,
          message: 'procedure removed',
        },
        true,
      )
    } else {
      diffProcedure(proc, match, report)
    }
  }
  for (const proc of next.procedures) {
    if (!previousKeys.has(proc.key)) {
      report(
        { kind: 'procedure-added', path: proc.key, message: 'procedure added' },
        false,
      )
    }
  }
  return diff
}

function diffProcedure(
  prev: CatalogProcedure,
  next: CatalogProcedure,
  report: Report,
): void {
  const path = prev.key
  if (prev.docs?.deprecated !== true && next.docs?.deprecated === true) {
    report(
      {
        kind: 'deprecated',
        path,
        pointer: '/docs/deprecated',
        message: 'procedure deprecated',
      },
      false,
    )
  }
  const slot = { path, report }
  diffSlot(prev.input, next.input, {
    ...slot,
    direction: 'input',
    pointer: '/input',
    label: 'input',
  })
  diffSlot(prev.output, next.output, {
    ...slot,
    direction: 'output',
    pointer: '/output',
    label: 'output',
  })
  diffErrors(prev.errors, next.errors, path, report)
}

function diffErrors(
  prev: CatalogError[],
  next: CatalogError[],
  path: string,
  report: Report,
): void {
  const nextByCode = new Map(next.map((error) => [error.code, error]))
  const prevCodes = new Set(prev.map((error) => error.code))
  for (const error of prev) {
    const pointer = `/errors/${escapePointer(error.code)}`
    const match = nextByCode.get(error.code)
    if (match === undefined) {
      // Old clients just never see it.
      report(
        {
          kind: 'error-removed',
          path,
          pointer,
          message: `error ${error.code} removed`,
        },
        false,
      )
      continue
    }
    if (error.status !== match.status) {
      report(
        {
          kind: 'error-status-changed',
          path,
          pointer: `${pointer}/status`,
          message: `error ${error.code} status ${String(error.status ?? 'unset')} -> ${String(match.status ?? 'unset')}`,
        },
        false,
      )
    }
    diffSlot(error.data, match.data, {
      path,
      report,
      direction: 'output',
      pointer: `${pointer}/data`,
      label: `error ${error.code} data`,
    })
  }
  for (const error of next) {
    if (!prevCodes.has(error.code)) {
      report(
        {
          kind: 'error-added',
          path,
          pointer: `/errors/${escapePointer(error.code)}`,
          message: `error ${error.code} added`,
        },
        false,
      )
    }
  }
}

type Slot = {
  path: string
  report: Report
  direction: Direction
  pointer: string
  label: string
}

function diffSlot(
  prev: CatalogSchema | undefined,
  next: CatalogSchema | undefined,
  slot: Slot,
): void {
  const { path, pointer, report } = slot
  if (prev === undefined || next === undefined) {
    if (prev === next) {
      return
    }
    const added = prev === undefined
    // An input schema where there was none rejects what old clients send;
    // an output schema that disappears no longer promises a shape.
    report(
      {
        kind: added ? 'schema-added' : 'schema-removed',
        path,
        pointer,
        message: `${slot.label} schema ${added ? 'added' : 'removed'}`,
      },
      slot.direction === 'input' ? added : !added,
    )
    return
  }
  if (prev.kind === 'stream' && next.kind === 'stream') {
    diffSlot(prev.item, next.item, {
      ...slot,
      pointer: `${pointer}/item`,
      label: `${slot.label} item`,
    })
    return
  }
  if (prev.kind === 'json' && next.kind === 'json') {
    diffJsonSchema(
      prev.jsonSchema,
      next.jsonSchema,
      slot.direction,
      pointer,
      (change) => {
        const { breaking, ...rest } = change
        report(
          { ...rest, path, message: `${slot.label}: ${rest.message}` },
          breaking,
        )
      },
    )
    return
  }
  if (prev.kind === next.kind) {
    return // both unavailable
  }
  if (prev.kind === 'unavailable' || next.kind === 'unavailable') {
    report(
      {
        kind: 'schema-availability-changed',
        path,
        pointer,
        message:
          next.kind === 'unavailable'
            ? `${slot.label} schema unavailable (${next.reason}); not checked`
            : `${slot.label} schema available; not checked`,
      },
      false,
    )
    return
  }
  report(
    {
      kind: 'procedure-kind-changed',
      path,
      pointer,
      message: `${slot.label} ${shape(prev)} -> ${shape(next)}`,
    },
    true,
  )
}

function shape(schema: CatalogSchema): string {
  return schema.kind === 'stream' ? 'stream' : 'unary'
}
