# Contributing to ts-pf

ts-pf is a contract-first TypeScript RPC library published as 19 `@ts-pf/*` packages from this monorepo. This guide covers the mechanics: setup, the verify chain, changesets, and releasing. The design rules are not repeated here.

- **Rules** (what the packages may and may not do, public names, locks): [`.agents/rules.md`](.agents/rules.md). It is authoritative; when this file and the rules disagree, the rules win.
- **Why each rule exists**: [`DECISIONS.md`](DECISIONS.md). Read it before proposing to change a lock.
- **Architecture map and "how to add things"**: [`.agents/skills/ts-pf/SKILL.md`](.agents/skills/ts-pf/SKILL.md).
- **Wire format**: [`packages/protocol/PROTOCOL.md`](packages/protocol/PROTOCOL.md).
- **User guides** (concepts, errors, testing, migration): [`docs/README.md`](docs/README.md). Their `ts` blocks are covered by `check:snippets`.
- **Security reports**: [`SECURITY.md`](SECURITY.md), not an issue.

## Setup

Node 22 (>= 22.22) or 24: dev tooling such as jsdom and the Changesets CLI does not support older 22.x, 23, or 25; `.nvmrc` pins 22, which is what CI treats as primary (the matrix also runs 24).

```sh
nvm use            # or any Node >= 22.22
npm ci             # npm workspaces + Turborepo; do not use another package manager
npm run build      # tsc -p tsconfig.build.json in every package, in DAG order
npm test
```

Build before the first test run and after changing a package another package imports: `tsc` (type-check and the Vitest typecheck of `*.test-d.ts`) and cross-package imports resolve `@ts-pf/*` to each package's `dist`. Inside one package Vitest aliases the package's own name to `src` (`selfAlias` in `vitest.shared.ts`), so the inner loop never passes against a stale own `dist`. The turbo `test` and `type-check` tasks depend on `build` for the same reason.

Useful single-package commands, from the repo root:

```sh
npm run build -w @ts-pf/server
npm test -w @ts-pf/server
npx vitest run packages/server/tests/implement.test.ts
```

## The verify chain

"Done" means this passes locally, in this order:

```sh
npm run lint && npm run lint:root && npm run check:skills && npm run check:deps && npm run type-check && npm test && npm run build && npm run check:exports && npm run check:snippets
```

| Step | What it enforces |
|---|---|
| `lint`, `lint:root` | Biome, warnings are errors; `lint:root` covers `scripts/` and the root configs |
| `check:skills` | every published package ships `skills/ts-pf-<pkg>/SKILL.md` with frontmatter, `files` includes `skills`, npm `keywords`, the hub skill names every opt-in package, `skills/README.md` indexes every skill, no oRPC names in code or docs, and every symbol a skill lists under `## API` is named in that package's README |
| `check:deps` | the `@ts-pf/*` dependency DAG from `.agents/rules.md` ("Packages"), in `package.json` and in `src` / `tests` imports; no cycles |
| `type-check` | `tsc --noEmit` per package, including `tests/*.test-d.ts` |
| `test` | Vitest per package and per example (examples are smoke tests) |
| `build` | `dist` for every package |
| `check:exports` | `exports` point at `dist`, `publishConfig` is `access` only, the packed tarball carries `LICENSE` and every export target |
| `check:snippets` | every fenced `ts` block in `README.md`, `docs/**/*.md`, `packages/*/README.md`, `packages/*/skills/**/SKILL.md`, and `examples/**/README.md` compiles under `strict` + NodeNext against `dist` (needs a build). Flags: `ts no-check` for prose fragments, `ts bundler` for Vite / Astro / mvc-kit blocks |

CI runs the same chain on Node 22 and 24, plus `changeset status` on pull requests and `mcp-sdk-floor` (the `@ts-pf/mcp` package and example on the lowest supported `@modelcontextprotocol/server`).

## Benchmarks

`npm run bench` (`scripts/bench.mjs`, after `npm run build`) times the call pipeline end to end on one small contract: the in-process `createLocalClient` unary and declared-error paths, `FetchHandler` + `FetchLink` through an in-memory fetch stub (unary, declared error, a 2000-item JSONL stream), and `PortHandler` + `PortLink` over a `MessageChannel` (unary, stream). It prints ops/s from the median of five timed rounds per row. The numbers are relative, not targets: they move with the machine, the Node version, and `zod`, so compare runs on the same machine only. Run it before and after a change to `runProcedure`, the interceptor chains, the client proxies, or `FetchHandler.handle`, with three runs each, and put the before/after medians in the PR; a `node --cpu-prof` of the same loops is the way to see which frame moved.

## Making a change

1. **Find the owner.** The "Owns" table in `.agents/rules.md` and the file map in the internal skill say which package a change belongs in. A new pipe (another transport) is a `Duplex` adapter bound with `DuplexHandler` / `DuplexLink` from the message packages, or a new adapter package that calls `runProcedure` / implements `Link`; a new paradigm (REST, GraphQL) is a projection like `@ts-pf/openapi`. Neither touches `createImplementer`, middleware, or `createClient`.
2. **Respect the DAG.** `scripts/check-deps.mjs` encodes it. A new edge is a `.agents/rules.md` change and a `check-deps.mjs` change in the same PR, with the reason in `DECISIONS.md`.
3. **Use the public names.** The "Public names" table lists the oRPC names that must not come back. `check:skills` greps for them.
4. **Keep docs in the same PR.** A public API, name, or happy-path change updates `packages/<pkg>/skills/ts-pf-<pkg>/SKILL.md` and that package's `README.md`. If the change is an opt-in happy path, also update the matching snippet in the hub skill `packages/contract/skills/ts-pf-app/SKILL.md`. The README is narrative plus install plus one snippet; the skill is `Do` / `API` / `Pair with` / `Don't`, and `check:skills` asserts every `API` symbol appears in the README.
5. **Wire changes update `PROTOCOL.md`** and the conformance tests listed in the internal skill's review checklist. Additive-looking changes still need a design note; the v1 handshake has no extension point.
6. **Tests.** Vitest for behaviour; `expectTypeOf` plus `@ts-expect-error` in `tests/*.test-d.ts` for types.

### Adding a changeset

Every PR that changes a published `packages/*` package includes a changeset. Run it from the repo root and commit the generated file:

```sh
npx changeset
```

Pick the packages, the bump (`patch` / `minor` / `major`), and write the summary as a changelog entry a consumer will read. Anything under `packages/<pkg>/` counts as a package change, including its `README.md` and `skills/` (both ship in the tarball, and CI's `changeset status` fails without a changeset); root docs, `scripts/`, and examples do not. A change under `packages/` that ships nothing (tests, devDependencies) still needs one: `npx changeset add --empty` satisfies `changeset status` without a release. Do not run `changeset pre enter` and do not add `.changeset/pre.json`.

### Adding a package

The checklist for a new published package (`package.json` fields, `LICENSE`, skill, tsconfigs, `vitest.config.ts`, `skills/README.md` row, `scripts/check-deps.mjs` `PROD` entry, changeset) is the "Code" section of `.agents/rules.md`; `check:exports`, `check:skills`, and `check:deps` fail on omissions. New examples follow the "Examples" section there and are appended to `.changeset/config.json` `ignore`.

## Examples

`examples/` is the learning path and the end-to-end smoke suite:

| Example | Shows |
|---|---|
| `hello` | contract, implementer, `FetchHandler`, `FetchLink`, `createClient`; `npm run dev` listens through an example-local `node:http` bridge |
| `codegen` | split-repo `emit(catalog)` → `createClient<Contract>` |
| `message` | `PortHandler` + `PortLink` over `MessageChannel` |
| `stream` | `StreamCodec` + `stream()` |
| `plugins` | `CallPlugin` / `CallInterceptor`, first-party retry / cache / dedupe, local timeout and audit plugins |
| `mcp` | `@ts-pf/mcp` toolset + tool host, served by the MCP SDK v2 client over HTTP and stdio in both protocol eras |

Only `hello` listens; the others are smoke-tested. Do not add a framework adapter package to make an example simpler.

## Releasing

Releases use [Changesets](https://github.com/changesets/changesets) and publish to the npm `latest` dist-tag. The full runbook, including npm trusted-publisher setup, lives in [`.changeset/README.md`](.changeset/README.md); this is the shape of it.

1. Merging a PR to `main` triggers the [release workflow](.github/workflows/release.yml). It re-runs lint, `lint:root`, `check:skills`, `check:deps`, type-check, test, build, `check:exports`, and `check:snippets` (CI has already run the full chain on the PR), then `changesets/action` opens or updates a **Version packages** PR when unpublished changesets exist. That PR consumes `.changeset/*.md`, bumps versions, writes `CHANGELOG.md` files, rewrites internal `"*"` dependencies to the released versions (do not restore `"*"` afterwards), and refreshes the lockfile.
2. Merging the Version packages PR publishes every bumped package, pushes git tags, and creates GitHub Releases. Do not publish by hand in a separate step; that skips tags and releases.
3. Publishing uses npm **trusted publishing** (OIDC), not a token. Each `@ts-pf/*` package has a trusted publisher pointing at user `crobinson42`, repository `ts-pf`, workflow filename `release.yml`, empty environment, with `npm publish` allowed (not stage-only). `id-token: write` is the only credential. Do not set `NPM_TOKEN`, and do not pass `registry-url` to `actions/setup-node`: it writes an empty `_authToken` and npm then skips OIDC and fails with `ENEEDAUTH`. The job runs `scripts/probe-npm-oidc.mjs` first so a failed token exchange prints the registry's message. A 404 `package not found` from that exchange means a missing trusted publisher, not an unpublished package; `scripts/trust-github-publishers.sh` creates them all with interactive 2FA.
4. The release job pins Node 24 with a global `npm@11.12.1`, the combination the OIDC flow was verified with. It is deliberately not tied to `.nvmrc`.
5. Repository settings the workflow needs: **Settings → Actions → General → Workflow permissions**: *Read and write permissions* and *Allow GitHub Actions to create and approve pull requests*.

Local equivalent, for inspection only:

```sh
GITHUB_TOKEN=<token> npm run changeset:version   # needs a token (@changesets/changelog-github) and a pending changeset; exits 1 when there is none
npm run build
npm run changeset:publish                        # only from a trusted-publishing context or an npm login with publish rights
```

## Pull requests

The PR template carries the checklist. In short: verify chain green, changeset for package changes, skill and README updated with the API, rationale in `DECISIONS.md` for any lock you add or change, conventional-commit style messages (`feat(server): …`, `fix(client-http): …`, `docs: …`, `chore: …`).
