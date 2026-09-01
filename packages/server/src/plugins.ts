export interface HandlerPlugin {
  readonly name: string
  onRequest?(ctx: {
    request: Request
  }): Request | Response | undefined | Promise<Request | Response | undefined>
  onContext?(ctx: {
    request: Request
    context: unknown
  }): unknown | Promise<unknown>
  onResponse?(ctx: {
    request: Request
    response: Response
    context?: unknown
  }): Response | undefined | Promise<Response | undefined>
  onError?(ctx: {
    request: Request
    error: unknown
    context?: unknown
  }): void | Promise<void>
}
