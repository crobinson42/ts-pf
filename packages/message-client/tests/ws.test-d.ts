// Checked by `tsc --noEmit` (type-check); not run by Vitest.
// `@types/ws` is a devDependency used only here, as a type fixture: the npm
// `ws` 8 client class must fit `WsLink` with no cast. No runtime `ws` import.
import { describe, expectTypeOf, it } from 'vitest'
import type { WebSocket as NodeWebSocket } from 'ws'
import { type WebSocketLike, WsLink } from '../src/index.js'

declare const WsClass: typeof NodeWebSocket
declare const nodeSocket: NodeWebSocket
declare const browserSocket: WebSocket

describe('WsLink socket types', () => {
  it('accepts the npm ws client class as the WebSocket constructor', () => {
    new WsLink({ url: 'ws://localhost/rpc', WebSocket: WsClass })
  })

  it('accepts an npm ws socket', () => {
    expectTypeOf(nodeSocket).toExtend<WebSocketLike>()
    new WsLink({ socket: nodeSocket })
  })

  it('still accepts the global WebSocket class and socket', () => {
    new WsLink({ url: 'ws://localhost/rpc', WebSocket: globalThis.WebSocket })
    new WsLink({ url: 'ws://localhost/rpc' })
    expectTypeOf(browserSocket).toExtend<WebSocketLike>()
    new WsLink({ socket: browserSocket })
  })

  it('rejects a constructor that does not build a WebSocketLike', () => {
    class NotASocket {
      constructor(readonly url: string) {}
    }
    // @ts-expect-error the instance lacks send / close / listeners
    new WsLink({ url: 'ws://localhost/rpc', WebSocket: NotASocket })
  })
})
