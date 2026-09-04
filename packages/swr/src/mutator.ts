import { callClient } from './call-client.js'
import type { SwrMutator } from './types.js'

export function createMutator(client: unknown): SwrMutator {
  return (_key, { arg }) => callClient(client, arg)
}
