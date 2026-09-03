import { PortHandler } from '@ts-pf/message-server'
import { app } from './app.js'

export const handler = new PortHandler(app)

export function bind(port: MessagePort) {
  return handler.bind(port, { context: {} })
}
