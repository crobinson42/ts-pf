export interface HandlerPlugin {
  name: string
  onRequest?(ctx: { request: Request }): void | Promise<void>
  onResponse?(ctx: {
    request: Request
    response: Response
  }): Response | void | Promise<Response | void>
  onError?(ctx: { request: Request; error: unknown }): void | Promise<void>
}
