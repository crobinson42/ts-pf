<!-- What changes and why. Link the issue if there is one. -->

## Checklist

Rules: [`.agents/rules.md`](https://github.com/crobinson42/ts-pf/blob/main/.agents/rules.md). Contributor guide: [`CONTRIBUTING.md`](https://github.com/crobinson42/ts-pf/blob/main/CONTRIBUTING.md).

- [ ] `npm run lint && npm run lint:root && npm run check:skills && npm run check:deps && npm run type-check && npm test && npm run build && npm run check:exports && npm run check:snippets` passes locally
- [ ] A published `packages/*` package changed → `.changeset/*.md` added (`npx changeset`)
- [ ] A public API, name, or happy path changed → `packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md` and that package's `README.md` updated in this PR (opt-in happy paths also update the matching snippet in `packages/contract/skills/ts-pf-app/SKILL.md`)
- [ ] Wire format changed → `packages/protocol/PROTOCOL.md` updated and the conformance tests pass
- [ ] New or changed lock in `.agents/rules.md` → rationale added to `DECISIONS.md`; new `@ts-pf/*` edge → `scripts/check-deps.mjs` updated in the same PR
- [ ] No oRPC names (`.agents/rules.md` "Public names")
