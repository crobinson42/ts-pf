---
"@ts-pf/astro": minor
---

Raise the `astro` peer dependency floor from `>=4.9.0` to `>=7.0.0`, the major the package is built and tested against. Astro 4, 5, and 6 are no longer declared as supported. The README and `ts-pf-astro` skill state the new floor; the skill now says to declare the other `@ts-pf/*` packages the app imports on the same version as `@ts-pf/astro`, and adds a lint rule that keeps server-only and Node-only entry points out of island code.
