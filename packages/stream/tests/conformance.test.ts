// Replays @ts-pf/protocol's language-neutral http-stream.json (see
// packages/protocol/conformance/README.md) through FetchLink + StreamCodec
// with an injected fetch: no server, no network.
import { isLocalFailure } from '@ts-pf/client'
import { FetchLink } from '@ts-pf/client-http'
import { mimeType, PROTOCOL_HEADER } from '@ts-pf/http'
import { isPFError, type PFError } from '@ts-pf/protocol'
import {
  type HttpStreamEnd,
  httpStreamConformance,
} from '@ts-pf/protocol/conformance'
import { StreamCodec } from '@ts-pf/stream'
import { describe, expect, it } from 'vitest'

/**
 * How a JSONL line that does not decode surfaces (the neutral
 * "transport-failure"; PROTOCOL.md appendix "Status on a rejected error"):
 * the codec's `BAD_REQUEST` with status 400, where an in-band failure line
 * has no status.
 */
const JSON_CODEC_DECODE_ERRORS = [
  'Invalid JSON',
  'Response body must be a JSON object',
  'Invalid RPC envelope',
]

function asPFError(error: unknown): PFError {
  expect(isPFError(error)).toBe(true)
  return error as PFError
}

function expectError(
  error: PFError,
  expected: { code: string; message: string; data?: unknown },
): void {
  expect(isLocalFailure(error)).toBe(false)
  expect(error.code).toBe(expected.code)
  expect(error.message).toBe(expected.message)
  expect(error.data).toStrictEqual(expected.data)
}

/** Reads the whole stream: its items as `{ output? }`, and how it ended. */
async function drain(
  stream: AsyncIterable<unknown>,
): Promise<{ items: Array<{ output?: unknown }>; error?: unknown }> {
  const items: Array<{ output?: unknown }> = []
  try {
    for await (const output of stream) {
      items.push(output === undefined ? {} : { output })
    }
    return { items }
  } catch (error) {
    return { items, error }
  }
}

function expectEnd(error: unknown, end: HttpStreamEnd): void {
  switch (end.kind) {
    case 'eof':
      expect(error).toBeUndefined()
      return
    case 'error': {
      const failure = asPFError(error)
      expectError(failure, end)
      expect(failure.status).toBeUndefined()
      return
    }
    case 'transport-failure': {
      const failure = asPFError(error)
      expect(isLocalFailure(failure)).toBe(false)
      expect(failure.code).toBe('BAD_REQUEST')
      expect(failure.status).toBe(400)
      expect(JSON_CODEC_DECODE_ERRORS).toContain(failure.message)
      return
    }
  }
}

describe(`conformance: http-stream.json (revision ${httpStreamConformance.revision})`, () => {
  for (const testCase of httpStreamConformance.cases) {
    it(`${testCase.id}: ${testCase.description}`, async () => {
      let sent: Request | undefined
      let response: Response | undefined
      const link = new FetchLink({
        url: 'http://conformance.test',
        codec: new StreamCodec(),
        fetch: async (input) => {
          sent = input as Request
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

      const want = testCase.expectRequest
      expect(sent?.method).toBe(want.method)
      expect(new URL(sent?.url ?? '').pathname).toBe(want.path)
      for (const [name, value] of Object.entries(want.headers)) {
        const actual = sent?.headers.get(name)
        expect(name === 'content-type' ? mimeType(actual) : actual).toBe(value)
      }
      const body: unknown = JSON.parse((await sent?.text()) ?? '')
      if (want.bodyOneOf === undefined) {
        expect(body).toStrictEqual(want.body)
      } else {
        expect(want.bodyOneOf).toContainEqual(body)
      }

      const expected = testCase.expect
      switch (expected.kind) {
        case 'success':
          expect(outcome).toStrictEqual({ ok: true, output: expected.output })
          return
        case 'error':
          expect(outcome.ok).toBe(false)
          expectError(
            asPFError(outcome.ok ? undefined : outcome.error),
            expected,
          )
          return
        case 'stream': {
          expect(outcome.ok).toBe(true)
          const output = outcome.ok ? outcome.output : undefined
          expect(Symbol.asyncIterator in Object(output)).toBe(true)
          const { items, error } = await drain(output as AsyncIterable<unknown>)
          expect(items).toStrictEqual(expected.items)
          expectEnd(error, expected.end)
          return
        }
        case 'version-mismatch': {
          // PROTOCOL.md appendix "HTTP (FetchLink)": checked before decode, body unread.
          expect(outcome.ok).toBe(false)
          const error = asPFError(outcome.ok ? undefined : outcome.error)
          expect(isLocalFailure(error)).toBe(false)
          expect(error.code).toBe('INTERNAL')
          expect(error.message).toBe(
            `Unsupported protocol version (${PROTOCOL_HEADER}: ${response?.headers.get(PROTOCOL_HEADER)})`,
          )
          expect(response?.bodyUsed).toBe(false)
          return
        }
        case 'transport-failure':
          throw new Error(
            'transport-failure responses belong in http.json (client-http runner)',
          )
      }
    })
  }
})
