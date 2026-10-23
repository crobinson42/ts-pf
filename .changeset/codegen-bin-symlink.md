---
"@ts-pf/codegen": patch
---

Fix the `ts-pf-codegen` bin being a silent no-op under `npx` and npm scripts. `isMain()` compared the module's real path with the `node_modules/.bin` symlink path, so the entry never ran; both sides now go through `realpathSync`. Add `--help` / `-h`, which print usage to stdout and exit 0.
