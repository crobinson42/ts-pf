export type Planet = { id: number; name: string }

export function createDb(): Planet[] {
  return [
    { id: 1, name: 'Earth' },
    { id: 2, name: 'Mars' },
  ]
}
