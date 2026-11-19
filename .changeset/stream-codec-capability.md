---
"@ts-pf/http": patch
"@ts-pf/server-http": patch
"@ts-pf/file": patch
"@ts-pf/stream": patch
"@ts-pf/sse": patch
"@ts-pf/protocol": patch
---

A stream procedure served through a codec that cannot carry streams no longer answers `200 {"ok":true,"output":{}}` and leaves its iterator open. `RpcCodec` gains an optional `streams` flag (`false` on `JSONCodec` and `MultipartCodec`, `true` on `StreamCodec` and `SseCodec`; custom codecs should set it). When it is `false`, `FetchHandler` answers a procedure whose contract input or output is `stream()` with `400 BAD_REQUEST` `Stream procedure requires a streaming codec` before the body is read and before context, middleware, or the handler run. A handler that returns an `AsyncIterable` the codec did not encode as a stream gets the same answer, and its iterator is closed. `PROTOCOL.md` documents the response.
