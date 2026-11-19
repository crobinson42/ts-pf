---
"@ts-pf/message-server": patch
---

A call cancelled before its handler resolved now closes the stream the handler then returns (`return()` once), instead of leaving it open. An async generator that was never pulled does not run its `finally` on `return()`; put cleanup on the handler's `signal`.
