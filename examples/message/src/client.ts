import { createClient } from '@ts-pf/client'
import type { ContractClient } from '@ts-pf/contract'
import { PortLink } from '@ts-pf/message-client'
import type { contract } from './contract.js'

export function createPlanetClient(port: MessagePort): {
  client: ContractClient<typeof contract>
  close: () => void
} {
  const link = new PortLink({ port })
  return { client: createClient(link), close: () => link.close() }
}
