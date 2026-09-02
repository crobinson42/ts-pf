import { run } from './client.js'
import { runLocal } from './local.js'
import { start } from './server.js'

await runLocal()
const { url, close } = await start()
try {
  await run(`${url}/rpc`)
} finally {
  await close()
}
