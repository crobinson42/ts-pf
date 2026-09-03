import { createClient } from '@ts-pf/client'
import type { ContractClient } from '@ts-pf/contract'
import { PortLink } from '@ts-pf/message-client'
import type { contract } from './contract.js'

export async function run(port: MessagePort) {
  const link = new PortLink({ port })
  const client: ContractClient<typeof contract> = createClient(link)

  try {
    const listed = await client.planet.list()
    console.log('list', listed)

    const found = await client.planet.find({ id: 1 })
    console.log('find', found)

    const created = await client.planet.create({ name: 'Venus' })
    console.log('create', created)
  } finally {
    link.close()
  }
}
