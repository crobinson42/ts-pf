---
"@ts-pf/message": minor
"@ts-pf/message-server": minor
"@ts-pf/message-client": patch
---

A server can now say why it refused a connection. When the per-connection context factory (`onHello`) throws a `PFError`, the `hello-error` carries that error's `code`, `message`, and `data`, the same mapping as a handler's error (`toWireError`), and every call on the client's link rejects with it — for example `UNAUTHORIZED` for a missing or expired credential. Any other throw still sends the fixed `INTERNAL` / `Internal server error`, with no message or stack. If you already throw a `PFError` from a context factory, its message now reaches the client. In `@ts-pf/message-server`, `HandlerOptions.onError` now sees only non-`PFError` throws from the context factory, as it already did for handlers.

`WebSocketLike.close` takes an optional `reason` (`close(code?, reason?)`; browser `WebSocket` and npm `ws` both fit). The handle `WsHandler.bind()` returns has `close(code?, reason?)`: it closes the socket with that code (default `1000`) and reason before tearing down the session, so an application close code such as `4401` is what the peer's socket receives (the client's calls still fail with a local `Connection closed`; read the code from the socket's own `close` event). Previously the session closed the socket with `1000` first. The message READMEs and skills document the `meta.authorization` convention for credentials and the 4400–4499 close-code range.
