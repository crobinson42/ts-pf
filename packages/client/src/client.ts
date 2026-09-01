import type { ContractClient } from '@ts-pf/contract'
import type { Link } from './fetch-link.js'

export function createClient<T>(link: Link): ContractClient<T> {
  const create = (path: string[]): unknown =>
    new Proxy((...args: unknown[]) => link.call(path, args[0]), {
      get(_, key) {
        if (key === 'then' || typeof key === 'symbol') {
          return undefined
        }
        return create([...path, String(key)])
      },
    })
  return create([]) as ContractClient<T>
}
