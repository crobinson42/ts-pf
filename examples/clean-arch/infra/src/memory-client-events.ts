import type { ClientEvent, ClientEvents } from '@ts-pf/example-clean-arch-app'

export class MemoryClientEvents implements ClientEvents {
  private readonly listeners = new Set<(event: ClientEvent) => void>()

  listenerCount(): number {
    return this.listeners.size
  }

  publish(event: ClientEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  subscribe(listener: (event: ClientEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
