/** Join an Astro base path with a route prefix. Simple join; no base detection. */
export function withBase(baseUrl: string, prefix: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  let path = prefix
  if (path.length > 0 && !path.startsWith('/')) {
    path = `/${path}`
  }
  const joined = `${base}${path}`
  if (joined.length === 0) {
    return '/'
  }
  return joined
}
