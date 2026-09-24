import type { AppDeps, Caller } from '@ts-pf/example-clean-arch-app'
import { type WebSocketLike, WsHandler } from '@ts-pf/message-server'
import { app } from './app.js'

export function bindSocket(
  deps: AppDeps,
  caller: Caller,
  socket: WebSocketLike,
) {
  return new WsHandler(app).bind(socket, { context: { deps, caller } })
}
