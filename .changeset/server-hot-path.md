---
"@ts-pf/server": patch
---

Faster calls: the procedure runtime allocates less per call, and the `errors` factory is built once per error map and shared. Visible effect: that shared `errors` object is frozen, so assigning to it from a handler or middleware now throws instead of leaking into other calls.
