// CI helper: exchange a GitHub OIDC token with the npm registry and print
// the real error. `npm publish` swallows exchange failures as ENEEDAUTH.
const PACKAGE = '@ts-pf/contract'
const AUDIENCE = 'npm:registry.npmjs.org'
const EXCHANGE = `https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(PACKAGE)}`

function fail(message) {
  console.error(message)
  process.exit(1)
}

function decodeJwtPayload(token) {
  const part = token.split('.')[1]
  if (!part) throw new Error('OIDC token is not a JWT')
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

function redact(value) {
  if (value && typeof value === 'object') {
    const copy = { ...value }
    if (typeof copy.token === 'string') copy.token = `(redacted, ${copy.token.length} chars)`
    return copy
  }
  return value
}

async function githubIdToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!requestUrl || !requestToken) {
    fail(
      'ACTIONS_ID_TOKEN_REQUEST_URL / ACTIONS_ID_TOKEN_REQUEST_TOKEN are missing. The job needs permissions.id-token: write.',
    )
  }
  const url = new URL(requestUrl)
  url.searchParams.set('audience', AUDIENCE)
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${requestToken}`,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || typeof body.value !== 'string') {
    fail(`GitHub OIDC request failed: HTTP ${res.status} ${JSON.stringify(body)}`)
  }
  return body.value
}

function printClaims(payload) {
  const keys = [
    'aud',
    'iss',
    'sub',
    'repository',
    'repository_owner',
    'repository_visibility',
    'workflow',
    'workflow_ref',
    'job_workflow_ref',
    'ref',
    'ref_type',
    'environment',
    'actor',
    'event_name',
  ]
  const shown = {}
  for (const key of keys) shown[key] = payload[key] ?? null
  console.log('GitHub OIDC claims:')
  console.log(JSON.stringify(shown, null, 2))
}

function hint(payload, status, body) {
  const workflowFile = String(payload.job_workflow_ref ?? payload.workflow_ref ?? '')
    .split('@')[0]
    .split('/')
    .pop()
  const env = payload.environment ? `"${payload.environment}"` : '(empty)'
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const lines = [
    '',
    `npm OIDC exchange failed for ${PACKAGE}: HTTP ${status}`,
    `body: ${text}`,
    '',
    'Trusted publisher on npmjs.com must match this identity (filename only, case-sensitive):',
    `  Organization or user: ${payload.repository_owner}`,
    `  Repository: ${String(payload.repository ?? '').split('/')[1] ?? ''}`,
    `  Workflow filename: ${workflowFile}   (not "${payload.workflow}", not a path)`,
    `  Environment: ${env}`,
    '  Allowed actions: include npm publish (not stage-only)',
    '',
    'Configs created after 3 Sep 2026 default to npm stage publish only.',
    'Changesets runs npm publish, so allow direct publish on every @ts-pf/* package.',
    'Existing connections cannot be edited — delete and recreate if a field is wrong.',
    'https://www.npmjs.com/package/@ts-pf/contract → Settings → Trusted publishing',
  ]
  if (/stage/i.test(text) && !/publish/i.test(text)) {
    lines.push('', 'This looks like a stage-only publisher. Check "allow npm publish".')
  }
  return lines.join('\n')
}

const token = process.env.NPM_ID_TOKEN || (await githubIdToken())
const payload = decodeJwtPayload(token)
printClaims(payload)

const res = await fetch(EXCHANGE, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
})
const raw = await res.text()
let parsed
try {
  parsed = JSON.parse(raw)
} catch {
  parsed = raw
}

if (res.ok && parsed && typeof parsed === 'object' && parsed.token) {
  console.log(`OIDC exchange ok for ${PACKAGE} (HTTP ${res.status}, token_type=${parsed.token_type ?? 'unknown'})`)
  process.exit(0)
}

fail(hint(payload, res.status, redact(parsed)))
