# @ts-pf/mcp

## 0.1.0

### Minor Changes

- [#20](https://github.com/crobinson42/ts-pf/pull/20) [`a2b4bdc`](https://github.com/crobinson42/ts-pf/commit/a2b4bdcbf7a51eae2e8ad919dcb5f92abebcb3ea) Thanks [@crobinson42](https://github.com/crobinson42)! - New opt-in package: MCP tools from a ts-pf contract. `@ts-pf/mcp/meta` adds `mcp({ effect, description, aliases })` for contract files. `@ts-pf/mcp` adds `createToolkit` (typed builders with `.describe` / `.effect` / `.inject` / `.input` / `.output` / `.errors` / `.examples`, plus `$context` / `$tool` / `$host` / `$toolset` / `$coverage`), `all()`, `bindTools` (in-process `app` or remote `client`), and `audit()`. `@ts-pf/mcp/sdk` adds `createMcpFactory`, a per-request `McpServer` factory for `@modelcontextprotocol/server` v2 (`createMcpHandler` / `serveStdio`), from an `app` or bound tools.

### Patch Changes

- Updated dependencies [[`a2b4bdc`](https://github.com/crobinson42/ts-pf/commit/a2b4bdcbf7a51eae2e8ad919dcb5f92abebcb3ea)]:
  - @ts-pf/contract@0.2.1
  - @ts-pf/docs@0.1.8
  - @ts-pf/server@0.4.1
