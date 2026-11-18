# @ts-pf/site

ts-pf documentation site (Astro + Starlight). Private; not published to npm.

`packages/docs` is the procedure-catalog library (`catalog()`, `docs()`). This workspace is the human docs site.

Published at [crobinson42.github.io/ts-pf](https://crobinson42.github.io/ts-pf/) from `main`.

## Sources of truth

The site does not own package or guide prose. `dev` and `build` copy:

| Page | Source |
|---|---|
| Getting started | root `README.md` |
| Tutorial | `docs/tutorial.md` |
| Guides | `docs/*.md` (except `docs/README.md` and the tutorial) |
| Packages | each published `packages/*/README.md` |
| Protocol | `packages/protocol/PROTOCOL.md` |

Those generated files are gitignored. Do not edit them. A published package without a README fails the copy.

Hand-written: `src/content/docs/index.md` only.

Relative links in those sources are rewritten to site paths (or GitHub, for files the site does not publish). Root-relative Markdown links on this site must include the GitHub Pages prefix, e.g. `[Contract](/ts-pf/packages/contract/)`.

```bash
npm run dev -w @ts-pf/site
```

The site is served under `/ts-pf` locally too: http://localhost:4321/ts-pf/.
