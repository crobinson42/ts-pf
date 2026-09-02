import { asResult, createClient, FetchLink } from '@ts-pf/client'
import type { ContractClient } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import { examplePort, isEntrypoint } from 'ts-pf-example-shared/listen'
import type { contract } from './contract.js'

export async function run(url: string) {
  const client: ContractClient<typeof contract> = createClient(
    new FetchLink({
      url,
      interceptors: [
        async ({ request, next }) => {
          request.headers.set('authorization', 'Bearer demo')
          return next(request)
        },
      ],
    }),
  )

  console.log('list', await client.planet.list())
  console.log('create', await client.planet.create({ name: 'Venus' }))

  const ac = new AbortController()
  ac.abort()
  try {
    await client.planet.list({ signal: ac.signal })
  } catch (error) {
    if (error instanceof PFError) {
      console.log('aborted', error.code, error.status)
    } else {
      console.log('aborted', error)
    }
  }

  const denied = createClient<typeof contract>(new FetchLink({ url }))
  const result = await asResult(denied.planet.create({ name: 'Nope' }))
  if (!result.ok) {
    console.log('create without interceptor', result.error.code)
  }
}

if (isEntrypoint(import.meta.url)) {
  await run(`http://127.0.0.1:${examplePort(3104)}/rpc`)
}
