# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's private vulnerability reporting for this repository: open <https://github.com/crobinson42/ts-pf/security/advisories/new> (the **Security** tab → **Report a vulnerability**). Do not open a public issue or pull request for a security problem.

Include the affected `@ts-pf/*` package and version, a minimal reproduction, and the impact you see (for example: a request body that bypasses `RequestLimitPlugin`, a codec that leaks `cause` or a stack onto the wire, a message frame that crashes a `PortHandler`). You will get an acknowledgement within a week. Fixes ship as a patch release of the affected packages through the normal [release flow](CONTRIBUTING.md#releasing), with a GitHub Security Advisory when the issue warrants one.

## Supported versions

Security fixes ship for the latest minor of the current major (npm dist-tag `latest`); every `@ts-pf/*` package shares that version. Older minors and earlier majors are not patched: upgrade to the latest release. Versions before 1.0.0 are not supported.

## Scope

In scope: code published under `@ts-pf/*`, and the wire behaviour documented in [`packages/protocol/PROTOCOL.md`](packages/protocol/PROTOCOL.md).

Out of scope: the `examples/*` workspaces (private, smoke-tested, not hardened), userland servers the README points to for hosting `FetchHandler` (`@hono/node-server`, `srvx`, Bun, Deno, Workers), and vulnerabilities in third-party schema libraries or peer dependencies (`zod`, `typebox`, `swr`, `mvc-kit`, `astro`, `@modelcontextprotocol/server`), which should go to those projects.
