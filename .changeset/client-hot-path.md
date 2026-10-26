---
"@ts-pf/client": patch
---

Faster calls: `createClient` now caches each nested proxy instead of rebuilding the path on every property access. Visible effects: `client.planet === client.planet` is now `true`, and a client keeps every property name it has been asked for, so accessing many dynamic keys holds memory for the life of the client.
