import type { PFError, PFResultPromise } from '@ts-pf/protocol'
import {
  type CallInterceptor,
  runCallInterceptors,
} from './call-interceptor.js'
import type { Link } from './link.js'
import { applyPlugins, type CallPlugin } from './plugin.js'

export function intercept(
  link: Link,
  options?: {
    interceptors?: readonly CallInterceptor[]
    plugins?: readonly CallPlugin[]
  },
): Link {
  const interceptors = applyPlugins(
    options?.plugins ?? [],
    options?.interceptors,
  )
  if (interceptors.length === 0) {
    return link
  }
  return {
    call(path, input, signal) {
      return runCallInterceptors(
        interceptors,
        path,
        input,
        signal,
        (nextInput, nextSignal) =>
          nextSignal
            ? link.call(path, nextInput, nextSignal)
            : link.call(path, nextInput),
      ) as PFResultPromise<unknown, PFError>
    },
  }
}
