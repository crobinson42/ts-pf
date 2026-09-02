import type { FetchHandler } from '@ts-pf/server'

export function fetchFor<TCtx>(
  handler: FetchHandler<TCtx>,
  context: TCtx | ((req: Request) => TCtx | Promise<TCtx>),
  prefix = '/rpc',
): typeof fetch {
  return async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    if (req.signal.aborted) {
      throw (
        req.signal.reason ??
        new DOMException('This operation was aborted', 'AbortError')
      )
    }
    const result = await handler.handle(req, { prefix, context })
    if (!result.matched) {
      return new Response('Not Found', { status: 404 })
    }
    return result.response
  }
}
