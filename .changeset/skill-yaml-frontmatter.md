---
"@ts-pf/astro": patch
"@ts-pf/client": patch
"@ts-pf/client-http": patch
"@ts-pf/codegen": patch
"@ts-pf/contract": patch
"@ts-pf/docs": patch
"@ts-pf/file": patch
"@ts-pf/http": patch
"@ts-pf/mcp": patch
"@ts-pf/message": patch
"@ts-pf/message-client": patch
"@ts-pf/message-server": patch
"@ts-pf/mvc-kit": patch
"@ts-pf/openapi": patch
"@ts-pf/protocol": patch
"@ts-pf/server": patch
"@ts-pf/server-http": patch
"@ts-pf/sse": patch
"@ts-pf/stream": patch
"@ts-pf/swr": patch
---

Quote consumer skill `description` front matter so `npx skills experimental_sync` can install the skills. An unquoted `Triggers:` is invalid YAML, and the installer skipped every published skill.
