# @ts-pf/file

Opt-in `MultipartCodec` for `File` / `Blob` attachments in [ts-pf](https://github.com/crobinson42/ts-pf#readme). JSON calls stay JSON; a call whose input or output contains a `Blob` goes as `multipart/form-data` with the JSON envelope in part `rpc`. Same contracts, same typed errors.

## Install

```sh
npm i @ts-pf/contract @ts-pf/server @ts-pf/server-http @ts-pf/client @ts-pf/client-http zod
npm i @ts-pf/file
```

## Use

Put `Blob` in a schema like any other value:

```ts
// contract.ts
import { procedure, router } from '@ts-pf/contract'
import { z } from 'zod'

export const contract = router({
  avatar: {
    upload: procedure
      .input(z.object({ userId: z.string(), image: z.instanceof(Blob) }))
      .output(z.object({ bytes: z.number() })),
  },
})
```

Put the same codec on both ends. Size caps are codec options, not a `HandlerPlugin`:

```ts
// server.ts
import { createImplementer } from '@ts-pf/server'
import { FetchHandler } from '@ts-pf/server-http'
import { MultipartCodec } from '@ts-pf/file'
import { contract } from './contract.js'

const impl = createImplementer(contract)
export const app = impl.router({
  avatar: {
    upload: impl.avatar.upload.handler(async ({ input }) => ({ bytes: input.image.size })),
  },
})

export const handler = new FetchHandler(app, {
  codec: new MultipartCodec({ maxFiles: 1, maxFileSize: 5 * 1024 * 1024 }),
})
```

```ts
// client.ts
import { createClient } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { MultipartCodec } from '@ts-pf/file'
import type { contract } from './contract.js'

const client = createClient<typeof contract>(
  new FetchLink({ url: '/rpc', codec: new MultipartCodec() }),
)

const image = new File(['…'], 'me.png', { type: 'image/png' })
await client.avatar.upload({ userId: 'u1', image }) // sent as multipart/form-data
```

`MultipartCodec` wraps `JSONCodec` (override with `{ inner }`). Wire details: [`PROTOCOL.md`](https://github.com/crobinson42/ts-pf/blob/main/packages/protocol/PROTOCOL.md) (Binary attachments). Serving `handler`: [root README](https://github.com/crobinson42/ts-pf#serving-fetchhandler).

## Agent skills

This package ships [`ts-pf-file`](https://github.com/crobinson42/ts-pf/blob/main/packages/file/skills/ts-pf-file/SKILL.md). Sync with `npx skills experimental_sync -y`.
