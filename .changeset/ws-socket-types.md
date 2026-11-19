---
"@ts-pf/message": patch
"@ts-pf/message-server": patch
"@ts-pf/message-client": patch
---

npm `ws` 8.x sockets now type-check as `WebSocketLike` with no cast, so a `ws` server socket binds to `WsHandler` and the `ws` client class is accepted as `WsLink`'s `WebSocket` option. The listener event shape gained an optional `type`; browser `WebSocket` stays assignable. The `@ts-pf/message-server` docs add a recipe for serving `WsHandler` from a `node:http` server with npm `ws` (`noServer` + `handleUpgrade`); the app still owns listen and upgrade.
