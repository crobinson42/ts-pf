# ts-pf agent instructions

This repository's **rules** live in [`.agents/rules.md`](.agents/rules.md). Read and follow them for every task.

When implementing, reviewing, or extending the library, also load the **ts-pf** skill at [`.agents/skills/ts-pf/SKILL.md`](.agents/skills/ts-pf/SKILL.md).

Consumer usage skills live in `packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md` (hub `ts-pf-app` on `contract`) and ship on npm. Downstream: `npx skills experimental_sync -y` (never a library `postinstall`). Library PRs still update the matching skill in the same change as a public API / name / happy-path; `npm run check:skills` is part of done.

> **Note:** Always use a subagent after implementing a change to review and evaluate `.agents/**` and `packages/*/skills/**` files for correctness, completeness, and consistency. The subagent should also check for any missing or outdated documentation.

Focus on clean code and clear architecture. Avoid unnecessary complexity and ensure that the code is easy to understand and maintain.