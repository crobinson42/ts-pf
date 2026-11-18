# ts-pf agent instructions

This repository's **rules** live in [`.agents/rules.md`](.agents/rules.md). Read and follow them for every task. The rationale behind each lock is in [`DECISIONS.md`](DECISIONS.md).

When implementing, reviewing, or extending the library, also load the **ts-pf** skill at [`.agents/skills/ts-pf/SKILL.md`](.agents/skills/ts-pf/SKILL.md).

Consumer usage skills live in `packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md` (hub catalog `ts-pf-app` on `contract`) and ship on npm. The hub names opt-in packages the consumer has not installed; usage skills version with their package. Index: `skills/README.md`. Downstream: `npx skills experimental_sync -y` (never a library `postinstall`). Library PRs still update the matching skill in the same change as a public API / name / happy-path (and the hub snippet when that happy path is opt-in); `npm run check:skills` is part of done.

The human docs site is `site/` (`@ts-pf/site`, private). It is not `packages/docs` — that name is the procedure-catalog library. Package pages are generated from each published `README.md`; guides from `docs/*.md`; getting started from the root README; protocol from `packages/protocol/PROTOCOL.md`. Those generated files are gitignored. A published package's README is its docs page. Do not add a hand-written Starlight page for a package. `npm run dev -w @ts-pf/site` serves http://localhost:4321/ts-pf/.

> **Note:** Always use a subagent after implementing a change to review and evaluate `.agents/**` and `packages/*/skills/**` files for correctness, completeness, and consistency. The subagent should also check for any missing or outdated documentation.

Focus on clean code and clear architecture. Avoid unnecessary complexity and ensure that the code is easy to understand and maintain.

**Remember**: Code quality is not negotiable. Clear, maintainable code enables rapid development and confident refactoring.