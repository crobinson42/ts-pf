import { PortHandler } from '@ts-pf/message-server'
import { app } from './app.js'

export function bind(port: MessagePort) {
  return new PortHandler(app).bind(port, { context: {} })
}
