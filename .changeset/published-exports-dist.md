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

Point package `exports` at `dist`. npm does not rewrite `publishConfig.exports`, so published tarballs previously resolved to missing `src/` files.
