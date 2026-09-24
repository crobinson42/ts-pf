# clean-arch

Onion layers around one procedure contract. Domain, app, and infra do not import `@ts-pf/*`. Api is the composition root: it implements the contract and serves it on Fetch and WebSocket.

```
domain  →  zod
app     →  domain
infra   →  domain, app
api     →  app, infra, @ts-pf/contract, server, server-http, message-server, stream
```

| Layer | Owns |
|---|---|
| `domain` | `Task`, persisted schema, `TaskRepository`, domain events `task.created` / `task.completed` |
| `app` | one file per use case (`useCase` builder, `Caller`, guards), task view schemas, ports, client event `task.changed` |
| `infra` | in-memory adapters for those ports, including `MemoryAccess` |
| `api` | contract, `mount` onto the implementer, `finishTasks` batch, `FetchHandler`, `WsHandler`, `createRuntime()` |

Each use case takes a `Caller` (`traceId`, `actorId`). Guards such as `requireActor` run in the order written in the file. A guard is `useCase.guard.errors(...).narrow(...)` or `.check(...)`. It declares the failure it throws (`forbidden` is `{ FORBIDDEN: {} }`). The use case lists business failures only. `.caller()` only accepts those guard values. A guard whose context has `input` is written below `.input()`. A direct call returns `{ ok, data }` or `{ ok: false, error }`. `mount` maps those codes onto the wire errors. `task.finish` is the procedure whose payload is not one use case: it calls `completeTask` once per id.

`createRuntime()` builds the adapters, passes them through `createAppDeps()`, and injects `{ deps, caller }` on both pipes. Fetch reads `x-trace-id` and `x-actor-id` per request. WebSocket takes the caller at bind. A write on one pipe is visible to the other. Domain events stay in-process. `onDomainEvent` turns each one into `task.changed`, and `task.watch` streams those client events.

```ts
import { createRuntime } from '@ts-pf/example-clean-arch-api'

const { fetch, bindWebSocket } = createRuntime()
// fetch(request)                          FetchHandler + StreamCodec, prefix /rpc
// bindWebSocket(socket, { traceId, actorId })  WsHandler, same deps
```

The caller owns listening and the WebSocket upgrade. `bindWebSocket` takes an already-open `WebSocketLike` and the `Caller` for that socket. `MemoryAccess` allows the actor id `ada` to complete tasks.
