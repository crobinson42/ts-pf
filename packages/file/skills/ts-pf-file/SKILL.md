---
name: ts-pf-file
description: Use when sending File or Blob attachments over ts-pf HTTP with MultipartCodec. Triggers: @ts-pf/file, MultipartCodec, multipart/form-data.
---

# @ts-pf/file

Opt-in `MultipartCodec` for binary attachments. JSON calls stay JSON.

Install: `npm i @ts-pf/file`

Link for agents: `npx skills experimental_sync -y`

## Do

```ts
import { MultipartCodec } from '@ts-pf/file'
import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'

const codec = new MultipartCodec() // optional { maxFiles, maxFileSize, inner }
new FetchHandler(app, { codec })
new FetchLink({ url: '/rpc', codec })
```

Values that contain `File`/`Blob` are sent as `multipart/form-data` with the JSON envelope in part `rpc`. Put the same codec on handler and link.

## API

- `MultipartCodec`

## Pair with

- `ts-pf-server-http` / `ts-pf-client-http` (`{ codec }`)
- Wire: `@ts-pf/protocol` `PROTOCOL.md` (Binary attachments)

## Don't

- `PFFile`, `file()`, or exported walk helpers.
- File size caps as a `HandlerPlugin` — they are codec options.
