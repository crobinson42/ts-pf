---
'@ts-pf/mcp': patch
---

`all()` reads each tool's procedure meta once for its effect and docs filters. On large procedure types this cuts the type instantiations `all(tk)` adds by half or more, and by about 19% on plain contracts. No API change.
