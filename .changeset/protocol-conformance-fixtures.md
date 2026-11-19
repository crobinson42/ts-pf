---
"@ts-pf/protocol": minor
---

Language-neutral conformance fixtures for `PROTOCOL.md`. The package now ships `conformance/` with `http.json` (unary requests and response classification: success, failure envelopes, proxy HTML / 502 transport failures, version mismatch), `http-stream.json` (JSONL streams), and `ws.json` (WebSocket frame scripts: handshake, multiplex, first frame, streams, cancel, close codes), plus a `README.md` that says how to replay them. They are plain JSON, versioned with the spec revision (`"protocol": 1`, `"revision": "1.2"`), so a client written in any language can prove it follows the protocol in its own test suite, with no server and no network. The TypeScript clients are tested against the same files. New entry `@ts-pf/protocol/conformance` exports them typed (`httpConformance`, `httpStreamConformance`, `wsConformance`) for TypeScript runners.
