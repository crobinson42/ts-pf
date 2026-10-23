---
"@ts-pf/server-http": patch
---

`FetchHandler` now looks the procedure up before decoding the request body (order: `onRequest` plugins → method check → lookup → decode → context → run). An unknown path under the prefix answers `404 NOT_FOUND` without buffering or parsing the body, so an unknown path with an invalid JSON body is now `404 NOT_FOUND` instead of `400 BAD_REQUEST`, and an unknown path with a streamed body over `RequestLimitPlugin`'s `maxBodySize` (no `Content-Length`) is now `404` instead of `413` because the stream is never read. `RequestLimitPlugin`'s `Content-Length` check still runs first in `onRequest`, so a declared oversize body stays `413 PAYLOAD_TOO_LARGE` on any path. A known path with an invalid body is still `400`, a non-POST is still `405` on any path, and `HandlerPlugin.onError` / `onError` / the default log see the 404 exactly as before.
