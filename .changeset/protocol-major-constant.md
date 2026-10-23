---
"@ts-pf/protocol": minor
---

Add `PROTOCOL_MAJOR = 1 as const`, the wire major carried as `v` on message `hello` / `hello-ok`. `PROTOCOL_VERSION` is now derived from it (`` `${PROTOCOL_MAJOR}` ``) and keeps its literal type `'1'` and value, so `catalog()` output and `catalogHash()` are unchanged. `PROTOCOL.md` is revision 1.1: wire bytes are identical; the HTTP binding now states how servers and clients treat the `x-ts-pf-protocol` header, and a "Revisions" paragraph defines what an additive 1.x change may do.
