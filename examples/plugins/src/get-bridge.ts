import { parseProcedurePath } from '@ts-pf/http'
import { PFError } from '@ts-pf/protocol'
import {
  type ImplementedProcedure,
  type ImplementedRouter,
  lookupProcedure,
} from '@ts-pf/server'
import type { HandlerPlugin } from '@ts-pf/server-http'

/**
 * Contract meta that opts a side-effect-free procedure into GET:
 * `.meta({ http: { method: 'GET', cacheControl: 'public, max-age=60' } })`.
 */
export type HttpMeta = {
  http?: { method?: 'GET' | 'POST'; cacheControl?: string }
}

/**
 * Userland GET binding: `GET {prefix}/{path}?input=<JSON>` becomes the POST
 * `FetchHandler` already serves, and the response gets `Cache-Control`.
 * Only procedures whose contract meta says `http.method: 'GET'` are bridged;
 * any other GET falls through to `405 METHOD_NOT_ALLOWED`. Put it last in
 * `plugins` so no later `onRequest` re-wraps the request it marks.
 */
export class GetBridgePlugin implements HandlerPlugin {
  readonly name = 'get-bridge'
  private readonly bridged = new WeakMap<Request, string | undefined>()

  constructor(
    private readonly app: ImplementedRouter,
    private readonly prefix: string,
  ) {}

  onRequest({ request }: { request: Request }): Request | undefined {
    if (request.method !== 'GET') {
      return undefined
    }
    const url = new URL(request.url)
    const path = parseProcedurePath(url.pathname, this.prefix)
    const http = path && httpMeta(lookupProcedure(this.app, path))
    if (http?.method !== 'GET') {
      return undefined
    }
    // Mark the GET too: a malformed `?input` throws before the swap, and
    // `onResponse` then sees this request.
    this.bridged.set(request, http.cacheControl)
    const body = envelope(url.searchParams.get('input'))
    url.search = ''
    const headers = new Headers(request.headers)
    headers.set('content-type', 'application/json')
    const post = new Request(url, {
      method: 'POST',
      headers,
      body,
      signal: request.signal,
    })
    this.bridged.set(post, http.cacheControl)
    return post
  }

  onResponse({
    request,
    response,
  }: {
    request: Request
    response: Response
  }): Response | undefined {
    if (!this.bridged.has(request)) {
      return undefined
    }
    const cacheControl = cacheControlFor(response, this.bridged.get(request))
    if (cacheControl === undefined) {
      return undefined
    }
    const headers = new Headers(response.headers)
    headers.set('cache-control', cacheControl)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}

/**
 * Errors and responses that set a cookie are never stored. A `Cache-Control`
 * the call set itself (`ResponseHeadersPlugin`) wins over the contract's.
 */
function cacheControlFor(
  response: Response,
  fromMeta: string | undefined,
): string | undefined {
  if (!response.ok || response.headers.has('set-cookie')) {
    return 'no-store'
  }
  return response.headers.has('cache-control') ? undefined : fromMeta
}

function httpMeta(procedure: ImplementedProcedure | undefined) {
  return (procedure?.['~pf'].contract['~pf'].meta as HttpMeta | undefined)?.http
}

/** `?input=` is JSON; re-serialize it so the query cannot add envelope keys. */
function envelope(input: string | null): string {
  if (input === null) {
    return '{}'
  }
  try {
    return JSON.stringify({ input: JSON.parse(input) })
  } catch {
    throw new PFError({ code: 'BAD_REQUEST', message: 'Invalid JSON' })
  }
}
