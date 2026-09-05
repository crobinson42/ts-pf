# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to version and publish `@ts-pf/*` packages to the npm `latest` dist-tag. Do not run `changeset pre enter`.

## PRs

When a PR changes a published package, add a changeset and commit it with the PR:

```sh
npx changeset
```

Pick the packages, the bump (`patch` / `minor` / `major`), and a changelog summary. Examples are private and ignored.

New published packages start at `0.0.0` and need a changeset. They also ship `skills/ts-pf-<pkg>/SKILL.md` with `"files"` including `skills`, and a `keywords` array (shared family terms plus package-specific). New examples must be added to `config.json` `ignore`.

## Release

On `main`, the [release workflow](../.github/workflows/release.yml) opens a **Version packages** PR when unpublished changesets exist. Merging that PR publishes to npm as `latest`.

`GITHUB_TOKEN` can only open that PR if the repo allows it: **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**. Also set **Read and write permissions**. After changing this, re-run the `release` workflow.

```sh
npm install @ts-pf/contract
```

Local equivalent:

```sh
npm run changeset:version   # consumes .changeset/*.md, writes versions + CHANGELOG.md, refreshes the lockfile
npm run build
npm run changeset:publish   # npm dist-tag `latest`
```

The GitHub Action does **not** run `version` / `publish` through a shell. Use an npm script (`npm run changeset:version`), not `cmd && other`.

`changeset version` rewrites internal `"*"` `@ts-pf/*` dependencies to the released version so the published tarball is installable. Do not restore `"*"` by hand after a version bump.

## Trusted publishing

1. Reserve is already done (`@ts-pf` on npm).
2. Each `@ts-pf/*` package has a [trusted publisher](https://docs.npmjs.com/trusted-publishers). Fields are case-sensitive and cannot be edited later (delete + recreate):
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
4. Push / merge to `main`. The release workflow opens the version PR.
5. Merge the version PR. Packages publish to `latest`.
