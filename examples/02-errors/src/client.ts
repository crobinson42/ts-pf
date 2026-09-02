import { asResult, createClient, FetchLink } from '@ts-pf/client'
import type { ContractClient } from '@ts-pf/contract'
import { examplePort, isEntrypoint } from 'ts-pf-example-shared/listen'
import type { contract } from './contract.js'

export async function run(url: string) {
  const client: ContractClient<typeof contract> = createClient(
    new FetchLink({ url }),
  )

  const found = await client.planet.find({ id: 1 })
  console.log('find', found)

  const missing = await asResult(client.planet.find({ id: 999 }))
  if (!missing.ok && missing.error.code === 'NOT_FOUND') {
    console.log('missing', missing.error.data.id)
  }

  const locked = await asResult(client.planet.locked())
  if (!locked.ok) {
    console.log('locked', locked.error.code)
  }
}

if (isEntrypoint(import.meta.url)) {
  await run(`http://127.0.0.1:${examplePort(3102)}/rpc`)
}
