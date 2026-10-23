---
"@ts-pf/http": patch
---

`JSONCodec.decodeRequest` now rejects a JSON envelope object that has keys but no `input` key (for example `{"id":1}` instead of `{"input":{"id":1}}`) with `BAD_REQUEST` `Request body must be {"input": ...}` instead of decoding it as an undefined input. `{}`, an empty body, and `{"input":null}` still decode to `input: undefined`. `MultipartCodec`, `StreamCodec`, and `SseCodec` delegate to this codec, so the multipart `rpc` part and each JSONL input line get the same check.
