import type { Interceptor } from '@ts-pf/client-http'
import { PROTOCOL_HEADER } from '@ts-pf/http'

/** Longer URLs stay POST: CDNs and proxies commonly cap URLs near 8 KB. */
export const GET_MAX_URL = 8192

/**
 * Client half of `GetBridgePlugin`: sends the JSON POST for each listed
 * pathname as `GET ?input=<JSON>`, with object keys sorted so equal inputs
 * share one cache key. Non-JSON bodies (multipart, streams) and long URLs
 * stay POST, which the server accepts for every procedure. The GET drops
 * `content-type` and `x-ts-pf-protocol` (the server accepts it absent), so a
 * cross-origin read is a simple request unless your own headers add a
 * preflight.
 */
export function getInterceptor(pathnames: readonly string[]): Interceptor {
  const gets = new Set(pathnames)
  return async ({ request, next }) => {
    const url = new URL(request.url)
    if (
      request.method !== 'POST' ||
      !gets.has(url.pathname) ||
      request.headers.get('content-type') !== 'application/json'
    ) {
      return next()
    }
    const { input } = JSON.parse(await request.clone().text()) as {
      input?: unknown
    }
    if (input !== undefined) {
      url.searchParams.set('input', stableStringify(input))
    }
    if (url.href.length > GET_MAX_URL) {
      return next()
    }
    const headers = new Headers(request.headers)
    headers.delete('content-type')
    headers.delete(PROTOCOL_HEADER)
    return next(
      new Request(url, { method: 'GET', headers, signal: request.signal }),
    )
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  )
}
