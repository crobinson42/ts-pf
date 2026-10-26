# @ts-pf/mcp

## 0.2.2

### Patch Changes

- Updated dependencies [[`d061b89`](https://github.com/crobinson42/ts-pf/commit/d061b89e4819a3f39ca8fd7bbc33f0fd8ff3aee3)]:
  - @ts-pf/docs@0.1.11
  - @ts-pf/contract@0.2.3
  - @ts-pf/protocol@0.2.2
  - @ts-pf/server@0.4.3

## 0.2.1

### Patch Changes

- [#27](https://github.com/crobinson42/ts-pf/pull/27) [`2cab8d4`](https://github.com/crobinson42/ts-pf/commit/2cab8d4ae9969ba61d043dc27c1cc926bfbbe8a2) Thanks [@crobinson42](https://github.com/crobinson42)! - `all(node, { inject })` reads keys from intersection / `allOf` inputs (TypeBox `Type.Intersect`, Zod record intersections) and record, loose, and catchall inputs, and injected keys are removed from every `allOf` member of the model schema, so the model cannot set them. `all()` throws when `inject` is set and a selected procedure's input has no readable JSON Schema. An `inject` key must be a declared field of some selected input: a record input no longer makes a typo like `tenantID` compile (which left `tenantId` to the model on every other tool), and `all()` throws on such a key at runtime too. For an input that is only a record, use `.inject()` on that tool. `audit()` no longer reports an error for an injected key on an `allOf` root; the key is removed, and the union / `allOf` root warning still applies.

- [#26](https://github.com/crobinson42/ts-pf/pull/26) [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01) Thanks [@crobinson42](https://github.com/crobinson42)! - Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.
- Updated dependencies [[`491a8c1`](https://github.com/crobinson42/ts-pf/commit/491a8c1146309caf305c8bc62c874e3a7aba3a05), [`0189e86`](https://github.com/crobinson42/ts-pf/commit/0189e865c581dc962cbe2f77d7bf3e5423178a01)]:
  - @ts-pf/server@0.4.2
  - @ts-pf/contract@0.2.2
  - @ts-pf/docs@0.1.10
  - @ts-pf/protocol@0.2.1

## 0.2.0

### Minor Changes

- [#22](https://github.com/crobinson42/ts-pf/pull/22) [`c47e72c`](https://github.com/crobinson42/ts-pf/commit/c47e72c54411099bd21b5c7e2ade943cf162086b) Thanks [@crobinson42](https://github.com/crobinson42)! - Per-caller tool lists, OAuth scope step-up, and type-level `tags` / `hidden` filtering.
  
  - `.visible((info) => boolean)` on tools, `all(node, { visible })`, `$tool({ visible })`, and `$host({ visible })`. `McpTools.list(info)` filters per caller; a call to a hidden tool answers like an unknown tool. Inside a host, discovery, the `get_*` description, the `call_*` name enum, and annotations follow what the caller may see.
  - `.scopes([...])` on tools, `all(node, { scopes })`, and `$tool({ scopes })`. `createMcpFactory` registers an SDK `scopeChallenge`, so over HTTP a token missing a scope gets `403 insufficient_scope` (granted plus required scopes) and the client can re-consent. A host's `call_*` challenges per inner tool, never for one hidden from the caller. New optional async `McpTools.scopesFor(name, args, info?)`.
  - `all({ tags })` and literal `docs({ hidden: true })` now filter at the type level (with `docs()` from `@ts-pf/docs` 0.1.9 or later in contract files), and `$coverage` treats literal-hidden procedures as decided. `all()` result types no longer include literal-hidden procedures, so code that read such a key stops compiling. `all({ tags: [] })` now filters nothing (it used to drop every tool).
  - The `@modelcontextprotocol/server` peer range widens to `>=2.3.0 <3`.
  - A per-caller `client: (info) => …` runs once per tool call and is shared with mapper `call`.
  - Host descriptions say "this capability" for a single inner tool.

### Patch Changes

- Updated dependencies [[`c47e72c`](https://github.com/crobinson42/ts-pf/commit/c47e72c54411099bd21b5c7e2ade943cf162086b)]:
  - @ts-pf/docs@0.1.9

## 0.1.0

### Minor Changes

- [#20](https://github.com/crobinson42/ts-pf/pull/20) [`a2b4bdc`](https://github.com/crobinson42/ts-pf/commit/a2b4bdcbf7a51eae2e8ad919dcb5f92abebcb3ea) Thanks [@crobinson42](https://github.com/crobinson42)! - New opt-in package: MCP tools from a ts-pf contract. `@ts-pf/mcp/meta` adds `mcp({ effect, description, aliases })` for contract files. `@ts-pf/mcp` adds `createToolkit` (typed builders with `.describe` / `.effect` / `.inject` / `.input` / `.output` / `.errors` / `.examples`, plus `$context` / `$tool` / `$host` / `$toolset` / `$coverage`), `all()`, `bindTools` (in-process `app` or remote `client`), and `audit()`. `@ts-pf/mcp/sdk` adds `createMcpFactory`, a per-request `McpServer` factory for `@modelcontextprotocol/server` v2 (`createMcpHandler` / `serveStdio`), from an `app` or bound tools.

### Patch Changes

- Updated dependencies [[`a2b4bdc`](https://github.com/crobinson42/ts-pf/commit/a2b4bdcbf7a51eae2e8ad919dcb5f92abebcb3ea)]:
  - @ts-pf/contract@0.2.1
  - @ts-pf/docs@0.1.8
  - @ts-pf/server@0.4.1
