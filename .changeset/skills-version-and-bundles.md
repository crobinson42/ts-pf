---
"@ts-pf/contract": patch
---

The `ts-pf-app` skill now says to keep every `@ts-pf/*` package on the same version and update them together, and adds a lint rule that keeps server-only and Node-only entry points (`@ts-pf/server`, `@ts-pf/server-http`, `@ts-pf/message-server`, `@ts-pf/astro/server`, `@ts-pf/mcp`, the `stdio` subpaths, `@ts-pf/codegen`) out of browser bundles.
