/**
 * The media type of a `Content-Type` header value, lower-cased and without
 * parameters: `'application/json; charset=utf-8'` → `'application/json'`.
 * A missing or empty header gives `''`.
 */
export function mimeType(contentType: string | null | undefined): string {
  if (contentType == null || contentType === '') {
    return ''
  }
  return contentType.split(';')[0]?.trim().toLowerCase() ?? ''
}

/**
 * True for `application/json` and for a missing header (a bare JSON body
 * with no `Content-Type` is still treated as JSON, as `JSONCodec` does).
 */
export function isJsonContentType(
  contentType: string | null | undefined,
): boolean {
  const type = mimeType(contentType)
  return type === '' || type === 'application/json'
}
