export type Interceptor = (ctx: {
  request: Request
  next: (request?: Request) => Promise<Response>
}) => Promise<Response>

export async function runInterceptors(
  interceptors: Interceptor[],
  request: Request,
  send: (request: Request) => Promise<Response>,
): Promise<Response> {
  const run = (index: number, current: Request): Promise<Response> => {
    const interceptor = interceptors[index]
    if (!interceptor) {
      return send(current)
    }
    return interceptor({
      request: current,
      next: (nextRequest) => run(index + 1, nextRequest ?? current),
    })
  }
  return run(0, request)
}
