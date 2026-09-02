import { createClient, FetchLink } from '@ts-pf/client'
import type { ContractClient } from '@ts-pf/contract'
import { examplePort, isEntrypoint } from 'ts-pf-example-shared/listen'
import type { contract } from './contract.js'

export async function run(url: string) {
  const client: ContractClient<typeof contract> = createClient(
    new FetchLink({ url }),
  )

  const listed = await client.planet.list()
  console.log('list', listed)

  const found = await client.planet.find({ id: 1 })
  console.log('find', found)

  const created = await client.planet.create({ name: 'Venus' })
  console.log('create', created)
}

if (isEntrypoint(import.meta.url)) {
  await run(`http://127.0.0.1:${examplePort(3101)}/rpc`)
}
