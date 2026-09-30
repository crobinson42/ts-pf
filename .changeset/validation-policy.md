---
"@ts-pf/server": minor
"@ts-pf/server-http": minor
"@ts-pf/message-server": minor
"@ts-pf/protocol": patch
"@ts-pf/contract": patch
"@ts-pf/stream": patch
---

Output schema checks, including stream output items, run only when `validation.output` is true. Input checks stay on unless `validation.input` is false. Parsed output (strip, defaults, transforms) is applied only when output checks are on.
