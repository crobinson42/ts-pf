import { callClient } from './call-client.js'
import { inputFromKey } from './key.js'
import type { SwrFetcher } from './types.js'

export function createFetcher(client: unknown): SwrFetcher {
  return (key) => callClient(client, inputFromKey(key))
}
