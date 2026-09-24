import type { ClientEvent } from '../events.js'

export interface ClientEvents {
  publish(event: ClientEvent): void
  subscribe(listener: (event: ClientEvent) => void): () => void
}
