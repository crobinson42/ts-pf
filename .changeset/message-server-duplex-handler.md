---
"@ts-pf/message-server": minor
---

New `DuplexHandler<TCtx>`: `new DuplexHandler(app, options).bind(duplex, { context })` serves an implemented `app` over any `Duplex` from `@ts-pf/message`, so a third-party pipe (Electron IPC, a Chrome runtime port, WebTransport, a Unix socket) is a ~60-line duplex adapter instead of a rewrite of the multiplexer. It takes the same `HandlerOptions` as `PortHandler` (`maxFrameBytes`, `helloTimeoutMs`, `onError`, `interceptors`, `validation`), infers `TCtx` from the app's context brand the same way, and returns the same `{ close() }` handle. `PortHandler`, `WsHandler`, and `StdioHandler` are now thin wrappers over it; their public shapes and wire behaviour are unchanged.

Internal: the per-connection multiplexer is split into a frame router (`attachRouter`) and a per-id `ServerCall` state object. No frame or ordering changed.
