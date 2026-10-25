# @ts-pf/mcp handoff

Lives at `.agents/handoff/mcp/` (moved out of `docs/` so `check:snippets` does not type-check the design's fragments).

## Contents

| File | What it is |
| --- | --- |
| `DESIGN.md` | Final Design & Decisions (exported Oct 25, 2026). The spec to build v1 from. |
| `reference/type-spike/mcp2.ts` | Type-level prototype of the whole v1 API: toolkit, builder methods, `all()` with typed inject, `$toolset`, `$host`, `$coverage`, `bindTools`, `createMcpFactory` overloads. Skeletal runtime. |
| `reference/type-spike/r2-cases.ts`, `fixture2.ts` | Passing cases plus `@ts-expect-error` must-fail cases. |
| `reference/type-spike/r2full.txt` | The actual tsc error text for every must-fail case. |
| `reference/type-spike/gen2.mjs` | Generator for the 400-procedure perf fixture. |
| `reference/sdk-prototype/combined.ts` | Working adapter on `@modelcontextprotocol/server@2.4.0`: per-request `McpServer`, passthrough schemas, hosts, visibility, confirm fallback, timing. |
| `reference/sdk-prototype/out-combined.txt` | Its run output for every scenario. |

`DESIGN.md` names these as `spike/src/mcp2.ts` and `mcp-spike/combined.ts`; they are the files above.

The reference code is spike code: it proves the types and the SDK behaviour, but is not production quality. The type spike imported the built `@ts-pf/contract` / `@ts-pf/server` dist; the SDK prototype used an in-memory registry instead of ts-pf.

## Suggested prompt for Claude Code

```
Read AGENTS.md, .agents/rules.md, DECISIONS.md and the ts-pf skill first, then
.agents/handoff/mcp/DESIGN.md and the files in .agents/handoff/mcp/reference/.

Goal: implement v1 of a new opt-in package, packages/mcp (@ts-pf/mcp), exactly as
DESIGN.md specifies (v1 column of "Package shape and v1 scope"). Nothing from v1.1 or later.

Rules:
- DESIGN.md is the spec. Where it conflicts with .agents/rules.md, stop and ask me.
- The reference/ code is a proven spike; reuse its type techniques (mapper generic
  patterns, required '~tool' brand, NoInfer binding, name/coverage checks) but write
  production code that follows the repo's one-job-per-file and package conventions.
- Do not change other packages.
- Use the defaults listed under "Risks, and what still needs you" unless I say otherwise.

Before writing code, give me a short implementation plan: files, order, and the test
plan (type tests with expectTypeOf/@ts-expect-error, runtime tests, an examples/mcp
smoke test using the v2 client with versionNegotiation auto and legacy). Wait for my OK.

Done means the repo's full verify command passes, plus: the 400-procedure perf fixture
stays within about +1 s type-check time over the contract+app baseline.
```
