import type { ContractClient } from '@ts-pf/contract'
import { createFetcher } from './fetcher.js'
import { generateSwrKey } from './key.js'
import { createMatcher } from './matcher.js'
import { createMutator } from './mutator.js'
import { createLiveSubscriber, createSubscriber } from './subscriber.js'
import type {
  CreateSwrOptions,
  SwrClient,
  SwrMatcherStrategy,
  SwrSubscriberOptions,
} from './types.js'

const HELPERS = new Set([
  'key',
  'fetcher',
  'mutator',
  'matcher',
  'call',
  'subscriber',
  'liveSubscriber',
])

export function createSwr<T>(
  client: ContractClient<T>,
  options: CreateSwrOptions = {},
): SwrClient<T> {
  return createNode(client, [], options.prefix) as SwrClient<T>
}

function createNode(
  node: unknown,
  path: string[],
  prefix: string | undefined,
): unknown {
  const target = Object.assign(
    (...args: unknown[]) => {
      if (typeof node !== 'function') {
        throw new TypeError('Not a procedure')
      }
      return (node as (...args: unknown[]) => unknown)(...args)
    },
    {
      key(keyOptions?: { input?: unknown }) {
        return generateSwrKey(path, prefix, keyOptions?.input)
      },
      fetcher() {
        return createFetcher(node)
      },
      mutator() {
        return createMutator(node)
      },
      matcher(matcherOptions?: {
        input?: unknown
        strategy?: SwrMatcherStrategy
      }) {
        return createMatcher(
          path,
          prefix,
          matcherOptions?.input,
          matcherOptions?.strategy,
        )
      },
      call:
        typeof node === 'function'
          ? node
          : () => {
              throw new TypeError('Not a procedure')
            },
      subscriber(subscriberOptions?: SwrSubscriberOptions) {
        return createSubscriber(node, subscriberOptions)
      },
      liveSubscriber() {
        return createLiveSubscriber(node)
      },
    },
  )

  const cache = new Map<string, unknown>()

  return new Proxy(target, {
    get(proxyTarget, prop, receiver) {
      if (prop === 'then' || typeof prop === 'symbol') {
        return undefined
      }
      if (typeof prop === 'string' && HELPERS.has(prop)) {
        return Reflect.get(proxyTarget, prop, receiver)
      }
      if (typeof prop !== 'string') {
        return undefined
      }
      let child = cache.get(prop)
      if (child === undefined) {
        const next =
          node !== null &&
          (typeof node === 'object' || typeof node === 'function')
            ? (node as Record<string, unknown>)[prop]
            : undefined
        child = createNode(next, [...path, prop], prefix)
        cache.set(prop, child)
      }
      return child
    },
  })
}
