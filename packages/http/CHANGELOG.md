# @ts-pf/http

## 0.2.0

### Minor Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`5fde308`](https://github.com/crobinson42/ts-pf/commit/5fde308064b37da76e3faaf688a0d4a734d1240d) Thanks [@crobinson42](https://github.com/crobinson42)! - `@ts-pf/http` exports the scaffolding its wrapping codecs share, so `MultipartCodec`, `StreamCodec`, and `SseCodec` stop carrying private copies:

  - `EnvelopeTextCodec` and `RpcEncodedText`: an `RpcCodec` whose encoded bodies are strings. This is the `inner` role of the three wrappers (they embed one envelope per multipart `rpc` part, JSONL line, or SSE event). `JSONCodec` implements it; `FetchHandler` / `FetchLink` still take any `RpcCodec`.
  - `mimeType(contentType)` (media type, lower-cased, without parameters; `''` when missing), `isJsonContentType(contentType)` (`application/json` or no header), and `jsonBodySource(text)` (an `RpcBodySource` over one in-memory envelope).

  `@ts-pf/file`, `@ts-pf/stream`, `@ts-pf/sse`: no behaviour change; the bytes on the wire are identical. The wrappers' `inner` option is now typed `EnvelopeTextCodec` instead of `RpcCodec`, which is what the runtime already required (a non-string inner body used to throw a plain `Error` at encode time; it is now a type error).

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`3268bc4`](https://github.com/crobinson42/ts-pf/commit/3268bc4b3cb5b94ceb8e8cb6473b0d7785911b8d) Thanks [@crobinson42](https://github.com/crobinson42)! - `status` on errors is now honest: it is optional transport metadata with no default, set only where a transport really has one.

  **Type change (may stop existing code compiling).** `PFError.status` and `PFErrorInit.status` are `number | undefined` (`@ts-pf/protocol`), and every `ClientError` variant — so `asResult(...).error.status` too — is `status?: number` (`@ts-pf/contract`, surfaced through `@ts-pf/client`). Code that used `status` as a plain number (`err.status.toFixed()`, `err.status >= 500`, passing it to a `number` parameter) needs `?? 400` or a guard. Code that compares `err.status === 404` still compiles but was already only right over HTTP; switch on `err.code` instead.

  **Runtime values per transport, before → after:**

  | Transport                                                                                                                    | before               | after                           |
  | ---------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------- |
  | HTTP unary failure (`FetchLink`)                                                                                             | HTTP response status | unchanged: HTTP response status |
  | HTTP after a stream started (`StreamCodec` JSONL line, `SseCodec` `event: error`, `Stream truncated`, `Invalid error event`) | `200`                | `undefined`                     |
  | WebSocket / stdio / MessagePort (`errorFromEnvelope`)                                                                        | `400`                | `undefined`                     |
  | Local failure (`localFailure`)                                                                                               | `0` + `local: true`  | unchanged                       |
  | In-process (`createLocalClient`, `errors.CODE()` with no declared `status`)                                                  | `400`                | `undefined`                     |
  | In-process, declared `{ status: 404 }`                                                                                       | `404`                | unchanged                       |
  | `new PFError({ code })` with no `status`                                                                                     | `400`                | `undefined`                     |

  **Server-side HTTP responses are unchanged.** `httpStatus()` in `@ts-pf/http` now owns the HTTP default: protocol codes map to `PROTOCOL_HTTP_STATUS`, any other code uses `error.status ?? 400`. A declared error with `status: 404` is still HTTP 404; a declared error with no `status` is still HTTP 400. `httpStatus()` no longer special-cases `local: true` (it returned `0`, which is not a valid `Response.status`; a server never sees a local failure, and one would now map to `INTERNAL` → 500). `createErrorFactory` stamps a declared `ErrorDef.status` and nothing when the definition omits one. `toJSON()` and the wire envelope are unchanged: `{ code, message, data? }`, never `status`.

  **`@ts-pf/mvc-kit`:** mvc-kit classifies a thrown value by `code` only when `status` is a finite number, so `bindClient` now hands mvc-kit a copy of the `PFError` with `status: 400` whenever the transport did not carry one (message links, mid-stream failures, declared errors without `status`). `errorCode` stays the `PFError.code` on every `Link`; the original error is not mutated, and HTTP failures and `localFailure` (`status: 0`) pass through as-is. `bindClient` calls therefore return a chained promise rather than the link's own promise object.

### Patch Changes

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5) Thanks [@crobinson42](https://github.com/crobinson42)! - Docs only. READMEs that did not name every symbol in their skill's `## API` section gain a matching `API` list (`check:skills` now asserts it), and every fenced `ts` block in READMEs and skills now type-checks against `dist` (`check:snippets`): missing `procedure` / `z` / `catalog` / `spawn` / `FetchHandler` imports were added, Node-resolved relative imports carry `.js`, the server skill implements the whole example contract, and prose fragments are marked `no-check`.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb) Thanks [@crobinson42](https://github.com/crobinson42)! - Declare `engines.node >=22` and ship the MIT `LICENSE` file in the tarball.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`053fd11`](https://github.com/crobinson42/ts-pf/commit/053fd11533e4897a3e63a81478cbc7b89182fdd2) Thanks [@crobinson42](https://github.com/crobinson42)! - `JSONCodec.decodeRequest` now rejects a JSON envelope object that has keys but no `input` key (for example `{"id":1}` instead of `{"input":{"id":1}}`) with `BAD_REQUEST` `Request body must be {"input": ...}` instead of decoding it as an undefined input. `{}`, an empty body, and `{"input":null}` still decode to `input: undefined`. `MultipartCodec`, `StreamCodec`, and `SseCodec` delegate to this codec, so the multipart `rpc` part and each JSONL input line get the same check.

- [#5](https://github.com/crobinson42/ts-pf/pull/5) [`53aaa5a`](https://github.com/crobinson42/ts-pf/commit/53aaa5a33ffee876b237ef6a85744c99cd4aa7d1) Thanks [@crobinson42](https://github.com/crobinson42)! - Rewrite the package READMEs shown on npmjs.com: one-line role, the full install line, a role-specific server + client snippet, and absolute links to the root README and the package skill (the previous relative `../../README.md` link did not resolve on npm). The `ts-pf-client` skill now notes that `DedupePlugin` / `CachePlugin` key every unary call by default and shows `key` restricting them to reads.

- Updated dependencies [[`913b537`](https://github.com/crobinson42/ts-pf/commit/913b537ec8ef3f37720bd9312e4e4a836892b8b5), [`d052cbd`](https://github.com/crobinson42/ts-pf/commit/d052cbdf650fa2a2d2dccbf3387b7184d57184fb), [`5e5a998`](https://github.com/crobinson42/ts-pf/commit/5e5a99848231e36d8bfa1ef57db9169aee6d9750), [`fb03a52`](https://github.com/crobinson42/ts-pf/commit/fb03a52ac4e8d520cd6b30c24331af8069de9cd5), [`025c1c4`](https://github.com/crobinson42/ts-pf/commit/025c1c47ca5ec7484e2c3d388278c5fe8380c6e6), [`53aaa5a`](https://github.com/crobinson42/ts-pf/commit/53aaa5a33ffee876b237ef6a85744c99cd4aa7d1), [`3268bc4`](https://github.com/crobinson42/ts-pf/commit/3268bc4b3cb5b94ceb8e8cb6473b0d7785911b8d)]:
  - @ts-pf/protocol@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [8cf3711]
  - @ts-pf/protocol@0.1.2

## 0.1.1

### Patch Changes

- 92c5262: Point package `exports` at `dist`. npm does not rewrite `publishConfig.exports`, so published tarballs previously resolved to missing `src/` files.
- Updated dependencies [92c5262]
  - @ts-pf/protocol@0.1.1

## 0.1.0

### Patch Changes

- First stable `0.1.0` release. Exit Changesets pre mode and publish to the npm `latest` dist-tag.
- Updated dependencies
  - @ts-pf/protocol@0.1.0

## 0.1.0-beta.2

### Patch Changes

- e85f033: Add npm `keywords` on every published package so the family is discoverable (typescript, rpc, typesafe, contract-first) with per-package terms for the pipe or adapter.
- Updated dependencies [e85f033]
  - @ts-pf/protocol@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- Publish from GitHub Actions with npm trusted publishing (OIDC). No `NPM_TOKEN`.
- Updated dependencies
  - @ts-pf/protocol@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 5ffff32: First public beta of the `@ts-pf` packages. Contract-first TypeScript RPC: one procedure model, Fetch and message adapters, and opt-in file, stream, SSE, docs, OpenAPI, codegen, SWR, and mvc-kit packages.

### Patch Changes

- 5ffff32: Ship a consumer agent skill with each package (`skills/ts-pf-<name>/SKILL.md`, plus hub `ts-pf-app` on `@ts-pf/contract`). After install or `npm update`: `npx skills experimental_sync -y`. Skills version with the package. Do not put this on a library `postinstall`.
- Updated dependencies [5ffff32]
- Updated dependencies [5ffff32]
  - @ts-pf/protocol@0.1.0-beta.0
