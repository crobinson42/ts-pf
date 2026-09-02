import { createClient, FetchLink } from '@ts-pf/client'
import type { ContractClient } from '@ts-pf/contract'
import { SseCodec } from '@ts-pf/sse'
import { examplePort, isEntrypoint } from 'ts-pf-example-shared/listen'
import type { contract } from './contract.js'

export async function run(url: string) {
  const codec = new SseCodec({ keepAliveMs: 0 })
  const client: ContractClient<typeof contract> = createClient(
    new FetchLink({ url, codec }),
  )

  console.log('find', await client.planet.find({ id: 1 }))

  const tokens = await client.planet.chat({ prompt: 'hello mars' })
  for await (const item of tokens) {
    console.log('token', item.token)
  }

  async function* chunks() {
    yield { chunk: 1 }
    yield { chunk: 2 }
  }
  console.log('ingest', await client.planet.ingest(chunks()))
}

if (isEntrypoint(import.meta.url)) {
  await run(`http://127.0.0.1:${examplePort(3107)}/rpc`)
}
