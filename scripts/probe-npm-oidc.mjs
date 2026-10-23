// CI helper: exchange a GitHub OIDC token with the npm registry for every
// published @ts-pf/* package and print the real error. `npm publish`
// swallows exchange failures as ENEEDAUTH.
//
// Packages are discovered from packages/*/package.json (non-private), the
// same set scripts/trust-github-publishers.sh creates publishers for.
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(root, 'packages')
const AUDIENCE = 'npm:registry.npmjs.org'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function exchangeUrl(pkg) {
  return `https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(pkg)}`
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

async function publishedPackages() {
  const names = []
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    let pkg
    try {
      pkg = JSON.parse(await readFile(join(packagesDir, entry.name, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    if (pkg.private || typeof pkg.name !== 'string') continue
    names.push(pkg.name)
  }
  if (names.length === 0) fail('no public packages found under packages/')
  return names.sort()
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

function hint(payload, failures) {
  const workflowFile = String(payload.job_workflow_ref ?? payload.workflow_ref ?? '')
    .split('@')[0]
    .split('/')
    .pop()
  const env = payload.environment ? `"${payload.environment}"` : '(empty)'
  const lines = [
    '',
    `npm OIDC exchange failed for ${failures.length} package(s):`,
    ...failures.map(({ pkg, status, body }) => `  ${pkg}: HTTP ${status} ${body}`),
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
    'https://www.npmjs.com/package/<name> → Settings → Trusted publishing',
    'Local (interactive 2FA; a bypass-2FA GAT cannot do this): bash scripts/trust-github-publishers.sh',
  ]
  const texts = failures.map((f) => f.body)
  if (failures.some((f) => f.status === 404) || texts.some((t) => /package not found/i.test(t))) {
    lines.push(
      '',
      'HTTP 404 "package not found" does not mean the npm package is missing.',
      'npm returns this when no trusted publisher matches this GitHub identity.',
    )
  }
  if (texts.some((t) => /stage/i.test(t) && !/publish/i.test(t))) {
    lines.push('', 'This looks like a stage-only publisher. Check "allow npm publish".')
  }
  return lines.join('\n')
}

// NPM_ID_TOKEN (manual runs) is reused for every package. In Actions a fresh
// GitHub token is requested per exchange, like `npm publish` does.
const fixedToken = process.env.NPM_ID_TOKEN || null
const nextToken = () => (fixedToken ? Promise.resolve(fixedToken) : githubIdToken())

const packages = await publishedPackages()
const firstToken = await nextToken()
const payload = decodeJwtPayload(firstToken)
printClaims(payload)
console.log(`Probing ${packages.length} packages`)

const failures = []
let token = firstToken
for (const pkg of packages) {
  const res = await fetch(exchangeUrl(pkg), {
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
    console.log(`ok: ${pkg} (HTTP ${res.status}, token_type=${parsed.token_type ?? 'unknown'})`)
  } else {
    const body = typeof parsed === 'string' ? parsed : JSON.stringify(redact(parsed))
    console.log(`FAIL: ${pkg} (HTTP ${res.status}) ${body}`)
    failures.push({ pkg, status: res.status, body })
  }
  if (pkg !== packages[packages.length - 1]) token = await nextToken()
}

if (failures.length > 0) fail(hint(payload, failures))
console.log(`ok: ${packages.length} packages`)
