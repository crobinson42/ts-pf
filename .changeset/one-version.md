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

Every published `@ts-pf/*` package now releases together on one version (a Changesets `fixed` group), starting with this release; that is why this package's version jumps. Keep all `@ts-pf/*` dependencies on the same version and update them together in one install command: internal dependencies are exact pins, so a mixed set installs duplicate copies of shared packages such as `@ts-pf/protocol`.
