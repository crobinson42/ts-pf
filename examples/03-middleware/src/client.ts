import { asResult, createClient, FetchLink } from '@ts-pf/client'
import type { ContractClient } from '@ts-pf/contract'
import { examplePort, isEntrypoint } from 'ts-pf-example-shared/listen'
import type { contract } from './contract.js'

export async function run(url: string) {
  const anon: ContractClient<typeof contract> = createClient(
    new FetchLink({ url }),
  )
  console.log('http list', await anon.planet.list())

  const denied = await asResult(anon.planet.create({ name: 'Nope' }))
  if (!denied.ok) {
    console.log('http create without user', denied.error.code)
  }

  const authed: ContractClient<typeof contract> = createClient(
    new FetchLink({
      url,
      headers: { authorization: 'Bearer demo' },
    }),
  )
  console.log('http create', await authed.planet.create({ name: 'Venus' }))
}

if (isEntrypoint(import.meta.url)) {
  await run(`http://127.0.0.1:${examplePort(3103)}/rpc`)
}
