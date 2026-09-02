import { run } from './client.js'
import { start } from './server.js'

const { url, close } = await start()
try {
  await run(`${url}/rpc`)
} finally {
  await close()
}
