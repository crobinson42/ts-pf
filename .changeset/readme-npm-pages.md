---
"@ts-pf/contract": patch
"@ts-pf/protocol": patch
"@ts-pf/server": patch
"@ts-pf/client": patch
"@ts-pf/file": patch
"@ts-pf/http": patch
---

Rewrite the package READMEs shown on npmjs.com: one-line role, the full install line, a role-specific server + client snippet, and absolute links to the root README and the package skill (the previous relative `../../README.md` link did not resolve on npm). The `ts-pf-client` skill now notes that `DedupePlugin` / `CachePlugin` key every unary call by default and shows `key` restricting them to reads.
