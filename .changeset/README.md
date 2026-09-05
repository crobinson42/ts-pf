# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to version and publish `@ts-pf/*` packages.

The repo is in **pre mode** with tag `beta`. Versions look like `0.1.0-beta.0`. `changeset publish` uses the npm dist-tag `beta`, not `latest`.

Do not run `npx changeset pre exit` until the first stable `0.1.0`.

## PRs

When a PR changes a published package, add a changeset and commit it with the PR:

```sh
npx changeset
```

Pick the packages, the bump (`patch` / `minor` / `major`), and a changelog summary. Examples are private and ignored.

The first public beta is a **minor** bump from `0.0.0` → `0.1.0-beta.N`. Later betas on that minor stay **patch**. A **minor** or **major** changeset starts `0.2.0-beta.0` or `1.0.0-beta.0`.

New published packages while pre mode is on must be added to `pre.json` `initialVersions` (at `0.0.0`) and get a changeset. They also ship `skills/ts-pf-<pkg>/SKILL.md` with `"files"` including `skills`. New examples must be added to `config.json` `ignore`.

## Release (beta)

On `main`, the [release workflow](../.github/workflows/release.yml) opens a **Version packages (beta)** PR when unpublished changesets exist. Merging that PR publishes to npm.

`GITHUB_TOKEN` can only open that PR if the repo allows it: **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**. Also set **Read and write permissions**. After changing this, re-run the `release` workflow.

```sh
npm install @ts-pf/contract@beta
```

Local equivalent:

```sh
npm run changeset:version   # consumes .changeset/*.md, writes 0.1.0-beta.N + CHANGELOG.md, refreshes the lockfile
npm run build
npm run changeset:publish   # npm dist-tag `beta`
```

The GitHub Action does **not** run `version` / `publish` through a shell. Use an npm script (`npm run changeset:version`), not `cmd && other`.

`changeset version` rewrites internal `"*"` `@ts-pf/*` dependencies to the prerelease version so the published tarball is installable. Do not restore `"*"` by hand after a version bump.

## First publish

1. Reserve is already done (`@ts-pf` on npm).
2. After the first version exists on npm, add a [trusted publisher](https://docs.npmjs.com/trusted-publishers) on **each** `@ts-pf/*` package. Fields are case-sensitive and cannot be edited later (delete + recreate):
   - Organization or user: `crobinson42`
   - Repository: `ts-pf`
   - Workflow filename: `release.yml` (filename only, including `.yml` — not `release`, not `.github/workflows/release.yml`)
   - Environment: leave empty
   - **Allow `npm publish`**. Configs created after 3 Sep 2026 default to `npm stage publish` only; Changesets runs `npm publish` and npm reports that mismatch as `ENEEDAUTH`.
   Do not set `NPM_TOKEN`. Do not pass `registry-url` to `actions/setup-node` (an empty `_authToken` makes npm skip OIDC). `id-token: write` is enough. The release job runs `scripts/probe-npm-oidc.mjs` before publish so a failed exchange prints the registry message instead of a bare `ENEEDAUTH`.

   A 404 `OIDC token exchange error - package not found` means **no matching trusted publisher**, not that the package is unpublished. Confirm on the package Settings page, or create them all locally with interactive 2FA (`npm` ≥ 11.15.0; a bypass-2FA GAT will 403):

   ```sh
   bash scripts/trust-github-publishers.sh
   ```

   The first `npm trust` prompts for 2FA. Enable **skip 2FA for 5 minutes** on npmjs.com so the rest of the loop can finish.
3. Enable **Settings → Actions → General → Workflow permissions**: **Read and write permissions** and **Allow GitHub Actions to create and approve pull requests** (`https://github.com/crobinson42/ts-pf/settings/actions`).
4. Push / merge to `main`. The release workflow opens the version PR. Re-run **release** if it failed before that setting was on.
5. Merge the version PR. Packages publish as `0.1.0-beta.N` with tag `beta`.

Until a stable release, `npm install @ts-pf/contract` (no tag) will not resolve. Always use `@beta`.

## Stable 0.1.0 later

```sh
npx changeset pre exit
npx changeset version
npm install
npm run build
npx changeset publish
```

That publishes `0.1.0` to `latest`. Then drop `@beta` from the root README Install section, retitle the release workflow (drop `(beta)`), and update `.agents/rules.md` / `.agents/skills/ts-pf/SKILL.md` so they no longer require pre mode.
