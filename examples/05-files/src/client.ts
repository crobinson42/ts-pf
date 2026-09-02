import { createClient, FetchLink } from '@ts-pf/client'
import type { ContractClient } from '@ts-pf/contract'
import { MultipartCodec } from '@ts-pf/file'
import { examplePort, isEntrypoint } from 'ts-pf-example-shared/listen'
import type { contract } from './contract.js'

export async function run(url: string) {
  const codec = new MultipartCodec()
  const client: ContractClient<typeof contract> = createClient(
    new FetchLink({ url, codec }),
  )

  console.log('list', await client.planet.list())

  const photo = new File(['hello'], 'earth.png', { type: 'image/png' })
  const uploaded = await client.planet.upload({ title: 'Earth', photo })
  console.log('upload', uploaded)

  const downloaded = await client.planet.download({ id: uploaded.id })
  console.log('download', downloaded.name, await downloaded.text())
}

if (isEntrypoint(import.meta.url)) {
  await run(`http://127.0.0.1:${examplePort(3105)}/rpc`)
}
