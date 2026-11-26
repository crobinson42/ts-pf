---
'@ts-pf/mcp': patch
---

Faster type checking: `all()` reads each tool's procedure meta once for its effect and docs filters. On large procedure types this cuts the instantiations `all(tk)` itself adds by half or more, and by about a fifth on plain contracts. No API change.
