---
"@ts-pf/server-http": patch
---

Document `HandleResult`: `matched: false` means only that the path is outside `prefix` (no plugin or context factory ran, body unread), so a request can fall through to another handler. The README also notes that a context factory runs after the body decode and that a `PFError` it throws is encoded like a handler error.
