---
"@ts-pf/client": patch
"@ts-pf/client-http": patch
"@ts-pf/codegen": patch
"@ts-pf/contract": patch
"@ts-pf/docs": patch
"@ts-pf/file": patch
"@ts-pf/http": patch
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

Ship a consumer agent skill with each package (`skills/ts-pf-<name>/SKILL.md`, plus hub `ts-pf-app` on `@ts-pf/contract`). After install or `npm update`: `npx skills experimental_sync -y`. Skills version with the package. Do not put this on a library `postinstall`.
