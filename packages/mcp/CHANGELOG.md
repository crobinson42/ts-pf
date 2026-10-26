# @ts-pf/mcp

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
