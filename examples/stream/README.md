# stream

`StreamCodec` + `stream()` on `FetchHandler` / `FetchLink`. Root `AsyncIterable` over JSONL envelopes.

```ts
import { stream, StreamCodec } from '@ts-pf/stream'
import { FetchHandler } from '@ts-pf/server-http'
import { FetchLink } from '@ts-pf/client-http'
```
