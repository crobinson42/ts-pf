import type { HandlerPlugin } from './plugins.js'

export type ResponseHeadersPluginContext = {
  resHeaders?: Headers
}

export class ResponseHeadersPlugin implements HandlerPlugin {
  readonly name = 'response-headers'

  onContext({
    context,
  }: {
    request: Request
    context: unknown
  }): ResponseHeadersPluginContext {
    return {
      ...(context as object),
      resHeaders: new Headers(),
    }
  }

  onResponse({
    response,
    context,
  }: {
    request: Request
    response: Response
    context?: unknown
  }): Response | undefined {
    const resHeaders = (context as ResponseHeadersPluginContext | undefined)
      ?.resHeaders
    if (!resHeaders) {
      return undefined
    }
    const headers = new Headers(response.headers)
    resHeaders.forEach((value, name) => {
      if (name === 'set-cookie') {
        headers.append(name, value)
      } else {
        headers.set(name, value)
      }
    })
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}
