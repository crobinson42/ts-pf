import { run } from './client.js'
import { bind } from './server.js'

const { port1, port2 } = new MessageChannel()
const server = bind(port1)
try {
  await run(port2)
} finally {
  server.close()
}
