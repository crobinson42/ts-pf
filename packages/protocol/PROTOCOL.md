# ts-pf RPC Protocol v1

Portable HTTP RPC. JSON only. Implementable from TypeScript, Kotlin, Swift, or any HTTP client.

## Request

```
POST {prefix}/{procedure.path}
Content-Type: application/json
x-ts-pf-protocol: 1

{ "input": { "id": 1 } }
```

Procedure path is the nested router keys joined by `/`. Example: `planet.find` → `/rpc/planet/find` when the prefix is `/rpc`.

Procedures with no input may omit `input` or send `null`.

v1 accepts **POST only**. Other methods return HTTP 405 with `error.code: "METHOD_NOT_ALLOWED"`.

## Success

```
HTTP 200
Content-Type: application/json
x-ts-pf-protocol: 1

{ "ok": true, "output": { "id": 1, "name": "Earth" } }
```

## Failure

```
HTTP 4xx/5xx
Content-Type: application/json
x-ts-pf-protocol: 1

{ "ok": false, "error": { "code": "NOT_FOUND", "message": "...", "data": { "id": 1 } } }
```

## Protocol errors

| Code | Status | When |
|---|---|---|
| `BAD_REQUEST` | 400 | Invalid JSON or envelope |
| `VALIDATION` | 422 | Input schema failed. `error.data.issues` is `{ message, path }[]` |
| `NOT_FOUND` | 404 | Prefix matched, procedure missing |
| `METHOD_NOT_ALLOWED` | 405 | Non-POST |
| `INTERNAL` | 500 | Unknown throw. Output schema failures also use 500 (server bug). |

Contract-declared error codes use the status on the error definition.

Network failures on the TypeScript client are surfaced as `INTERNAL` with `status: 0`.

## Versioning

Header `x-ts-pf-protocol` is `1`. v1 is JSON-only. File/Blob/SSE will be negotiated later without changing this envelope for JSON calls. Bump the header only if the JSON contract breaks.
