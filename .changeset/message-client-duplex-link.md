---
"@ts-pf/message-client": minor
---

New `DuplexLink`: `new DuplexLink({ duplex, ...LinkOptions })` implements `Link` over any `Duplex` from `@ts-pf/message`, so a third-party pipe (Electron IPC, a Chrome runtime port, WebTransport, a Unix socket) is a ~60-line duplex adapter instead of a rewrite of the multiplexer. It takes the same `LinkOptions` as `PortLink` (`meta`, `maxFrameBytes`, `helloTimeoutMs`) and has the same `close()`, which closes the duplex. `PortLink`, `WsLink`, and `StdioLink` are now thin wrappers over it; their public shapes and wire behaviour are unchanged.

Internal: the per-connection multiplexer is split into `DuplexLink` (session, id allocation, frame routing) and a per-id `ClientCall` state object. No frame or ordering changed.
