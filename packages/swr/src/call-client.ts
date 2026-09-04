export function callClient(
  client: unknown,
  input: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  if (typeof client !== 'function') {
    throw new TypeError('Expected a procedure client')
  }
  const fn = client as (...args: unknown[]) => Promise<unknown>
  if (input === undefined) {
    return signal !== undefined ? fn({ signal }) : fn()
  }
  return signal !== undefined ? fn(input, { signal }) : fn(input)
}
