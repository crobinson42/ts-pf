---
"@ts-pf/http": minor
"@ts-pf/file": patch
"@ts-pf/stream": patch
"@ts-pf/sse": patch
---

`@ts-pf/http` exports the scaffolding its wrapping codecs share, so `MultipartCodec`, `StreamCodec`, and `SseCodec` stop carrying private copies:

- `EnvelopeTextCodec` and `RpcEncodedText`: an `RpcCodec` whose encoded bodies are strings. This is the `inner` role of the three wrappers (they embed one envelope per multipart `rpc` part, JSONL line, or SSE event). `JSONCodec` implements it; `FetchHandler` / `FetchLink` still take any `RpcCodec`.
- `mimeType(contentType)` (media type, lower-cased, without parameters; `''` when missing), `isJsonContentType(contentType)` (`application/json` or no header), and `jsonBodySource(text)` (an `RpcBodySource` over one in-memory envelope).

`@ts-pf/file`, `@ts-pf/stream`, `@ts-pf/sse`: no behaviour change; the bytes on the wire are identical. The wrappers' `inner` option is now typed `EnvelopeTextCodec` instead of `RpcCodec`, which is what the runtime already required (a non-string inner body used to throw a plain `Error` at encode time; it is now a type error).
