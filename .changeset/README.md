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
npx changeset version   # consumes .changeset/*.md, writes 0.1.0-beta.N + CHANGELOG.md
npm install             # refresh the lockfile
npm run build
npx changeset publish   # npm dist-tag `beta`
```

`changeset version` rewrites internal `"*"` `@ts-pf/*` dependencies to the prerelease version so the published tarball is installable. Do not restore `"*"` by hand after a version bump.

## First publish

1. Reserve is already done (`@ts-pf` on npm).
2. Add `NPM_TOKEN` as a GitHub Actions secret (automation token with publish rights on `@ts-pf`), **or** configure [trusted publishing](https://docs.npmjs.com/trusted-publishers) for workflow `release.yml` once the packages exist.
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
