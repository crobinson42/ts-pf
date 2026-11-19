---
"@ts-pf/openapi": minor
---

Add an opt-in codegen profile. `openapi(catalog, { profile: 'codegen', info })` makes the choices that code generators (openapi-generator, Kiota, orval, swagger_parser) need, and still describes the same POST JSON RPC paths and envelopes. The profile expands to options that can each be set alone. An option you pass yourself overrides the profile's value:

- `envelopes: 'inline'`: request and success envelopes are inline in each operation; only `Input` / `Output` and hoisted ids are components.
- `errors: 'shared'`: one `RpcError` envelope, an `ErrorCode` enum, one `<Code>Data` per code with data, and `x-ts-pf-errors` on each operation. Throws when one code has two `data` shapes.
- `naming: 'pascal'`: `AuthVerifyCodeInput` instead of `auth.verifyCode.Input`. A procedure whose input or output is a `.meta({ id })` type uses the id. Throws when two schemas would get one name.
- `closeInputs`, `constAsEnum: 'exceptTags'`, `dropFormatPatterns`, `emptyInputNull`.

The default output is unchanged.
