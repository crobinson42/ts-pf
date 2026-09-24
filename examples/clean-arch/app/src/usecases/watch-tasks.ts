import type { ClientEvent } from '../events.js'
import { clientEventSchema } from '../events.js'
import { requireActor } from '../guards/require-actor.js'
import type { ClientEvents } from '../ports/client-events.js'
import { useCase } from '../use-case.js'

export const watchTasks = useCase('Watch task changes')
  .deps<{ clientEvents: ClientEvents }>()
  .caller(requireActor)
  .stream(clientEventSchema)
  .run(async function* ({ deps, signal }) {
    const queue: ClientEvent[] = []
    let waiting: (() => void) | undefined
    const unsubscribe = deps.clientEvents.subscribe((event) => {
      queue.push(event)
      const resolve = waiting
      waiting = undefined
      resolve?.()
    })
    const onAbort = () => {
      const resolve = waiting
      waiting = undefined
      resolve?.()
    }
    signal?.addEventListener('abort', onAbort)
    try {
      while (signal?.aborted !== true) {
        const next = queue.shift()
        if (next !== undefined) {
          yield next
          continue
        }
        await new Promise<void>((resolve) => {
          if (queue.length > 0 || signal?.aborted === true) {
            resolve()
            return
          }
          waiting = resolve
        })
      }
    } finally {
      signal?.removeEventListener('abort', onAbort)
      unsubscribe()
    }
  })
