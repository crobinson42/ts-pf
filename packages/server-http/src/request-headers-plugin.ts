import type { HandlerPlugin } from './plugins.js'

export type RequestHeadersPluginContext = {
  reqHeaders?: Headers
}

export class RequestHeadersPlugin implements HandlerPlugin {
  readonly name = 'request-headers'

  onContext({
    request,
    context,
  }: {
    request: Request
    context: unknown
  }): RequestHeadersPluginContext {
    return {
      ...(context as object),
      reqHeaders: request.headers,
    }
  }
}
