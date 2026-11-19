// Replays @ts-pf/protocol's language-neutral http.json (see
// packages/protocol/conformance/README.md) through FetchLink with an injected
// fetch: no server, no network.
import { isLocalFailure } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { mimeType, PROTOCOL_HEADER } from '@ts-pf/http'
import { isPFError, type PFError } from '@ts-pf/protocol'
import {
  type ConformanceRequest,
  type HttpCase,
  httpConformance,
} from '@ts-pf/protocol/conformance'
import { describe, expect, it } from 'vitest'

/**
 * How FetchLink reports a body that does not decode as an envelope (the
 * neutral "transport-failure"; PROTOCOL.md appendix "HTTP (FetchLink)"):
 * without `x-ts-pf-protocol`, `INTERNAL` `Non-RPC response (HTTP <status>)`;
 * under `x-ts-pf-protocol: 1`, the codec's own decode error. Never local.
 */
const JSON_CODEC_DECODE_ERRORS = [
  'Invalid JSON',
  'Response body must be a JSON object',
  'Invalid RPC envelope',
]

type Sent = { method: string; path: string; headers: Headers; body: string }

async function replay(testCase: HttpCase): Promise<{
  sent: Sent
  response: Response
  outcome: { ok: true; output: unknown } | { ok: false; error: unknown }
}> {
  let sent: Sent | undefined
  let response: Response | undefined
  const link = new FetchLink({
    url: 'http://conformance.test',
    fetch: async (input) => {
      const request = input as Request
      sent = {
        method: request.method,
        path: new URL(request.url).pathname,
        headers: request.headers,
        body: await request.text(),
      }
      response = new Response(testCase.response.body, {
        status: testCase.response.status,
        headers: testCase.response.headers,
      })
      return response
    },
  })
  const outcome = await link
    .call(testCase.request.procedure, testCase.request.input)
    .then(
      (output) => ({ ok: true as const, output }),
      (error: unknown) => ({ ok: false as const, error }),
    )
  if (sent === undefined || response === undefined) {
    throw new Error('FetchLink did not send a request')
  }
  return { sent, response, outcome }
}

function expectRequest(sent: Sent, expected: ConformanceRequest): void {
  expect(sent.method).toBe(expected.method)
  expect(sent.path).toBe(expected.path)
  for (const [name, value] of Object.entries(expected.headers)) {
    const actual = sent.headers.get(name)
    expect(name === 'content-type' ? mimeType(actual) : actual, name).toBe(
      value,
    )
  }
  const body: unknown = JSON.parse(sent.body)
  if (expected.bodyOneOf === undefined) {
    expect(body).toStrictEqual(expected.body)
  } else {
    expect(expected.bodyOneOf).toContainEqual(body)
  }
}

function failure(outcome: { ok: boolean; error?: unknown }): PFError {
  expect(outcome.ok).toBe(false)
  expect(isPFError(outcome.error)).toBe(true)
  return outcome.error as PFError
}

describe(`conformance: http.json (revision ${httpConformance.revision})`, () => {
  for (const testCase of httpConformance.cases) {
    it(`${testCase.id}: ${testCase.description}`, async () => {
      const { sent, response, outcome } = await replay(testCase)
      expectRequest(sent, testCase.expectRequest)

      const expected = testCase.expect
      switch (expected.kind) {
        case 'success':
          expect(outcome).toStrictEqual({ ok: true, output: expected.output })
          return
        case 'error': {
          const error = failure(outcome)
          expect(isLocalFailure(error)).toBe(false)
          expect(error.code).toBe(expected.code)
          expect(error.message).toBe(expected.message)
          expect(error.data).toStrictEqual(expected.data)
          return
        }
        case 'version-mismatch': {
          const error = failure(outcome)
          expect(isLocalFailure(error)).toBe(false)
          expect(error.code).toBe('INTERNAL')
          expect(error.message).toBe(
            `Unsupported protocol version (${PROTOCOL_HEADER}: ${response.headers.get(PROTOCOL_HEADER)})`,
          )
          expect(response.bodyUsed).toBe(false)
          return
        }
        case 'transport-failure': {
          const error = failure(outcome)
          expect(isLocalFailure(error)).toBe(false)
          if (response.headers.has(PROTOCOL_HEADER)) {
            expect(error.code).toBe('BAD_REQUEST')
            expect(JSON_CODEC_DECODE_ERRORS).toContain(error.message)
          } else {
            expect(error.code).toBe('INTERNAL')
            expect(error.message).toBe(
              `Non-RPC response (HTTP ${response.status})`,
            )
          }
          return
        }
      }
    })
  }
})
