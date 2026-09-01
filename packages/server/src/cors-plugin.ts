import type { HandlerPlugin } from './plugins.js'

export type CORSOrigin =
  | string
  | readonly string[]
  | ((
      origin: string | null,
    ) =>
      | string
      | readonly string[]
      | null
      | Promise<string | readonly string[] | null>)

export type CORSPluginOptions = {
  origin?: CORSOrigin
  allowMethods?: readonly string[]
  allowHeaders?: readonly string[]
  exposeHeaders?: readonly string[]
  maxAge?: number
  credentials?: boolean
}

export class CORSPlugin implements HandlerPlugin {
  readonly name = 'cors'
  private readonly origin: CORSOrigin
  private readonly allowMethods: readonly string[]
  private readonly allowHeaders: readonly string[] | undefined
  private readonly exposeHeaders: readonly string[] | undefined
  private readonly maxAge: number | undefined
  private readonly credentials: boolean

  constructor(options: CORSPluginOptions = {}) {
    const origin = options.origin ?? '*'
    const credentials = options.credentials ?? false
    if (credentials && origin === '*') {
      throw new Error(
        'CORSPlugin: credentials cannot be used with origin "*". Pass an origin list or a reflector.',
      )
    }
    this.origin = origin
    this.allowMethods = options.allowMethods ?? ['POST']
    this.allowHeaders = options.allowHeaders
    this.exposeHeaders = options.exposeHeaders
    this.maxAge = options.maxAge
    this.credentials = credentials
  }

  async onRequest({
    request,
  }: {
    request: Request
  }): Promise<Response | undefined> {
    if (request.method !== 'OPTIONS') {
      return undefined
    }
    const headers = new Headers()
    await this.applyOrigin(request, headers)
    if (this.allowMethods.length > 0) {
      headers.set('access-control-allow-methods', this.allowMethods.join(', '))
    }
    const allowHeaders =
      this.allowHeaders?.join(', ') ??
      request.headers.get('access-control-request-headers')
    if (allowHeaders) {
      headers.set('access-control-allow-headers', allowHeaders)
    }
    if (this.maxAge !== undefined) {
      headers.set('access-control-max-age', String(this.maxAge))
    }
    if (this.credentials) {
      headers.set('access-control-allow-credentials', 'true')
    }
    return new Response(null, { status: 204, headers })
  }

  async onResponse({
    request,
    response,
  }: {
    request: Request
    response: Response
  }): Promise<Response> {
    const headers = new Headers(response.headers)
    await this.applyOrigin(request, headers)
    if (this.credentials) {
      headers.set('access-control-allow-credentials', 'true')
    }
    if (this.exposeHeaders?.length) {
      headers.set(
        'access-control-expose-headers',
        this.exposeHeaders.join(', '),
      )
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  private async applyOrigin(request: Request, headers: Headers): Promise<void> {
    const requestOrigin = request.headers.get('origin')
    const allowed = toOriginList(await valueOrigin(this.origin, requestOrigin))
    if (allowed.includes('*')) {
      headers.set('access-control-allow-origin', '*')
      return
    }
    if (requestOrigin && allowed.includes(requestOrigin)) {
      headers.set('access-control-allow-origin', requestOrigin)
    }
    const vary = headers.get('vary')
    const hasOrigin = vary
      ?.split(',')
      .some((part) => part.trim().toLowerCase() === 'origin')
    if (!hasOrigin) {
      headers.append('vary', 'Origin')
    }
  }
}

function valueOrigin(
  origin: CORSOrigin,
  requestOrigin: string | null,
):
  | string
  | readonly string[]
  | null
  | Promise<string | readonly string[] | null> {
  return typeof origin === 'function' ? origin(requestOrigin) : origin
}

function toOriginList(
  value: string | readonly string[] | null,
): readonly string[] {
  if (value == null) {
    return []
  }
  return typeof value === 'string' ? [value] : value
}
