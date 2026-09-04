# @ts-pf/file

Opt-in `MultipartCodec` for binary attachments. JSON calls stay JSON; values that contain `File`/`Blob` are sent as `multipart/form-data` with the JSON envelope in part `rpc`. Pass the codec to `FetchHandler` / `FetchLink` from `@ts-pf/server-http` / `@ts-pf/client-http`.

Wire spec: [`packages/protocol/PROTOCOL.md`](../protocol/PROTOCOL.md) (Binary attachments).
