---
"@ts-pf/mcp": minor
---

Per-caller tool lists, OAuth scope step-up, and type-level `tags` / `hidden` filtering.

- `.visible((info) => boolean)` on tools, `all(node, { visible })`, `$tool({ visible })`, and `$host({ visible })`. `McpTools.list(info)` filters per caller; a call to a hidden tool answers like an unknown tool. Inside a host, discovery, the `get_*` description, the `call_*` name enum, and annotations follow what the caller may see.
- `.scopes([...])` on tools, `all(node, { scopes })`, and `$tool({ scopes })`. `createMcpFactory` registers an SDK `scopeChallenge`, so over HTTP a token missing a scope gets `403 insufficient_scope` (granted plus required scopes) and the client can re-consent. A host's `call_*` challenges per inner tool, never for one hidden from the caller. New optional async `McpTools.scopesFor(name, args, info?)`.
- `all({ tags })` and literal `docs({ hidden: true })` now filter at the type level (with `docs()` from `@ts-pf/docs` 0.1.9 or later in contract files), and `$coverage` treats literal-hidden procedures as decided. `all()` result types no longer include literal-hidden procedures, so code that read such a key stops compiling. `all({ tags: [] })` now filters nothing (it used to drop every tool).
- The `@modelcontextprotocol/server` peer range widens to `>=2.3.0 <3`.
- A per-caller `client: (info) => …` runs once per tool call and is shared with mapper `call`.
- Host descriptions say "this capability" for a single inner tool.
