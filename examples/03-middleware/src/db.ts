import type { Planet } from './app.js'

export function createDb(): Planet[] {
  return [{ id: 1, name: 'Earth' }]
}
