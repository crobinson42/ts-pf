---
'@ts-pf/astro': patch
'@ts-pf/client': patch
'@ts-pf/codegen': patch
'@ts-pf/contract': patch
'@ts-pf/docs': patch
'@ts-pf/http': patch
'@ts-pf/message': patch
'@ts-pf/message-client': patch
'@ts-pf/message-server': patch
'@ts-pf/mvc-kit': patch
'@ts-pf/openapi': patch
'@ts-pf/protocol': patch
'@ts-pf/server': patch
'@ts-pf/server-http': patch
'@ts-pf/sse': patch
'@ts-pf/stream': patch
'@ts-pf/swr': patch
---

Docs only. READMEs that did not name every symbol in their skill's `## API` section gain a matching `API` list (`check:skills` now asserts it), and every fenced `ts` block in READMEs and skills now type-checks against `dist` (`check:snippets`): missing `procedure` / `z` / `catalog` / `spawn` / `FetchHandler` imports were added, Node-resolved relative imports carry `.js`, the server skill implements the whole example contract, and prose fragments are marked `no-check`.
