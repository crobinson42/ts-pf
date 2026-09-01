import { isContractProcedure } from './procedure.js'

export const ROUTER_BRAND = '~pf' as const

export interface ContractRouterBrand {
  readonly '~pf': { type: 'router' }
}

export type ContractRouter = ContractRouterBrand | {
  [key: string]: ContractRouter | import('./procedure.js').ContractProcedure
}

export function isContractRouter(value: unknown): value is ContractRouterBrand {
  return (
    typeof value === 'object' &&
    value !== null &&
    '~pf' in value &&
    (value as ContractRouterBrand)['~pf']?.type === 'router'
  )
}

export function assertContractRouter(value: unknown, path: string[] = []): void {
  if (isContractProcedure(value)) {
    return
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    const location = path.length > 0 ? path.join('.') : '<root>'
    throw new Error(`Contract router leaf at "${location}" is not a procedure`)
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === '~pf') {
      continue
    }
    assertContractRouter(child, [...path, key])
  }
}
