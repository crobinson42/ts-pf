---
"@ts-pf/server-http": minor
---

`FetchHandler` gains an `onError(error, { request, path, context })` option. It is a side-effect hook called for every error response with the original thrown value (before unknown throws are mapped to `INTERNAL`), runs after each `HandlerPlugin.onError`, and cannot replace the response.

Behavior change: when `onError` is not set, `FetchHandler` now logs with `console.error` instead of staying silent — unknown (non-`PFError`) throws, and `INTERNAL` `PFError`s (output schema failure under `validation.output`, invalid declared error `data`, or an explicit `INTERNAL` throw). Declared and other protocol errors are not logged. Passing `onError` disables the default logging. Errors thrown after a streamed response has started are written in-band by the codec as `INTERNAL` items and do not reach `onError` or the default log. The callback type is exported as `FetchHandlerOnError`.

A JSON envelope object with keys but no `input` key (for example `{"id":1}` instead of `{"input":{"id":1}}`) is now `400 BAD_REQUEST` with message `Request body must be {"input": ...}` instead of a confusing `422 VALIDATION` on an undefined input. The check lives in `@ts-pf/http` `JSONCodec`, so it also covers the multipart `rpc` part and JSONL input lines. `{}` and `{"input":null}` still decode to an undefined input.

`METHOD_NOT_ALLOWED` now flows through the same error path, so `HandlerPlugin.onError` and `onError` also see 405s.
