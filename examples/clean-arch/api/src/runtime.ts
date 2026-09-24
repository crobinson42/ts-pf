import type { Caller } from '@ts-pf/example-clean-arch-app'
import { createAppDeps } from '@ts-pf/example-clean-arch-app'
import {
  MemoryAccess,
  MemoryClientEvents,
  MemoryTaskRepository,
  RandomIds,
  SystemClock,
} from '@ts-pf/example-clean-arch-infra'
import type { WebSocketLike } from '@ts-pf/message-server'
import { createFetch } from './http.js'
import { bindSocket } from './ws.js'

export function createRuntime() {
  const clientEvents = new MemoryClientEvents()
  const deps = createAppDeps({
    tasks: new MemoryTaskRepository(),
    ids: new RandomIds(),
    clock: new SystemClock(),
    clientEvents,
    access: new MemoryAccess(new Set(['ada'])),
  })

  return {
    clientEvents,
    fetch: createFetch(deps),
    bindWebSocket(socket: WebSocketLike, caller: Caller) {
      return bindSocket(deps, caller, socket)
    },
  }
}
