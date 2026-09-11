---
'@ts-pf/contract': patch
---

Make `ts-pf-app` the consumer capability catalog: opt-in packages (file, stream, SSE, message, docs/OpenAPI/codegen, SWR, mvc-kit) are discoverable from the hub that ships with `@ts-pf/contract`, then `npm i` + `npx skills experimental_sync -y` loads the versioned package skill.
