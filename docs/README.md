# Guides

Human-oriented guides that sit between the root [README](../README.md) (happy path and snippets), the per-package skills (`packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md`, agent cheat sheets with `API` / `Don't` lists), and the wire spec [`PROTOCOL.md`](../packages/protocol/PROTOCOL.md). Every fenced `ts` block here is type-checked by `npm run check:snippets`.

| Page | What it covers |
|---|---|
| [Concepts](concepts.md) | Contract vs implementer vs app, `$context` and context inference, `.use()` vs `.useAfter()`, links and adapters, codec pairing, the three interceptor kinds, validation defaults |
| [Errors](errors.md) | `PFError`, declared errors, the closed protocol code set and its JSON, `asResult` narrowing, `status` per transport, `httpStatus()`, `onError` and default logging |
| [Testing](testing.md) | In-process testing through a `fetch` stub or `createLocalClient`, declared errors, middleware context, streams, running the repo's examples |
| [Coming from tRPC / oRPC](coming-from-trpc-orpc.md) | Name mapping tables and a factual list of what is different |

Contributor docs are elsewhere: [`CONTRIBUTING.md`](../CONTRIBUTING.md) (setup, verify chain, releases), [`DECISIONS.md`](../DECISIONS.md) (why each lock exists), `.agents/rules.md` (the rules themselves).
