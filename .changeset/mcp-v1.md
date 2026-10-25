---
"@ts-pf/mcp": minor
---

New opt-in package: MCP tools from a ts-pf contract. `@ts-pf/mcp/meta` adds `mcp({ effect, description, aliases })` for contract files. `@ts-pf/mcp` adds `createToolkit` (typed builders with `.describe` / `.effect` / `.inject` / `.input` / `.output` / `.errors` / `.examples`, plus `$context` / `$tool` / `$host` / `$toolset` / `$coverage`), `all()`, `bindTools` (in-process `app` or remote `client`), and `audit()`. `@ts-pf/mcp/sdk` adds `createMcpFactory`, a per-request `McpServer` factory for `@modelcontextprotocol/server` v2 (`createMcpHandler` / `serveStdio`), from an `app` or bound tools.
