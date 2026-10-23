---
"@ts-pf/message": patch
---

`hello` / `hello-ok` frames and the handshake checks now use `PROTOCOL_MAJOR` from `@ts-pf/protocol` instead of a hard-coded numeric `1`. `HelloFrame.v` / `HelloOkFrame.v` are typed `typeof PROTOCOL_MAJOR` (still the literal `1`). No wire change and no behavior change.
