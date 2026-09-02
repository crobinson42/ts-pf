import { type ContractProcedure, isContractProcedure } from '@ts-pf/contract'

export type WalkEntry = {
  path: string[]
  procedure: ContractProcedure
}

export function walkContract(contract: unknown): WalkEntry[] {
  const entries: WalkEntry[] = []
  visit(contract, [], entries)
  return entries
}

function visit(node: unknown, path: string[], entries: WalkEntry[]): void {
  if (isContractProcedure(node)) {
    entries.push({ path, procedure: node })
    return
  }
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    const location = path.length > 0 ? path.join('.') : '<root>'
    throw new Error(`Contract router leaf at "${location}" is not a procedure`)
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === '~pf') {
      continue
    }
    visit(child, [...path, key], entries)
  }
}
