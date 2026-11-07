---
'@ts-pf/codegen': minor
---

Add `emitFiles()` and `ts-pf-codegen --out-dir` so a large catalog can be printed as one entry `.d.ts` plus a file per group and procedure, instead of a single inlined `Contract`. `_phantom.d.ts` is included only when some error has data.
