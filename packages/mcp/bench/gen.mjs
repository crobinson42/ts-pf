// Type-cost check for @ts-pf/mcp on a 400-procedure contract (20 slices × 20).
// Generates bench/.out/{contract,app,mcp}.ts, then compares `tsc
// --extendedDiagnostics` on contract + app alone (baseline) against contract +
// app + a full toolkit (20 shaped tools, all() with typed inject over the rest,
// three split hosts, name checks, $coverage, bindTools, both createMcpFactory
// forms). Budget: about +1 s check time. Needs `npm run build` first.
//
// Usage: npm run bench:types -w @ts-pf/mcp [-- --runs 3] [--tagged]
// Every procedure carries a literal docs() tag; --tagged also marks five
// procedures hidden and adds an all({ tags }) toolset (the type-level filters).
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SLICES = 20
const PER_SLICE = 20
const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '.out')
const runsArg = process.argv.indexOf('--runs')
const runs = runsArg > 0 ? Number(process.argv[runsArg + 1]) : 3
const range = (n) => [...Array(n).keys()]
const effects = ["'read'", "'write'", "'read'", "'destructive'"]
const TAGGED = process.argv.includes('--tagged')

function contract() {
  const slices = range(SLICES).map((i) => {
    const procs = range(PER_SLICE).map(
      (j) => `    p${j}: procedure
      .input(z.object({ tenantId: z.string(), id${i}: z.string(), n: z.number(), tag: z.enum(['a', 'b']) }))
      .output(z.object({ id: z.string(), name${i}: z.string(), count: z.number() }))
      .errors({ NOT_FOUND: { status: 404, data: z.object({ id: z.string() }) } })
      .meta({ ...docs({ description: 'Procedure ${j} of slice ${i}.', tags: ['t${j % 4}']${TAGGED && j === 19 && i < 5 ? ', hidden: true' : ''} }), ...mcp({ effect: ${effects[j % 4]} }) }),`,
    )
    return `  s${i}: {\n${procs.join('\n')}\n  },`
  })
  return `import { procedure, router } from '@ts-pf/contract'
import { docs } from '@ts-pf/docs'
import { mcp } from '@ts-pf/mcp/meta'
import { z } from 'zod'

export const contract = router({
${slices.join('\n')}
})
`
}

function app() {
  const slices = range(SLICES).map((i) => {
    const procs = range(PER_SLICE).map(
      (j) =>
        `    p${j}: impl.s${i}.p${j}.handler(({ input }) => ({ id: input.id${i}, name${i}: input.tenantId, count: input.n })),`,
    )
    return `  s${i}: {\n${procs.join('\n')}\n  },`
  })
  return `import { createImplementer } from '@ts-pf/server'
import { contract } from './contract.js'

export type Ctx = { tenantId: string }

const impl = createImplementer(contract).$context<Ctx>()
export const app = impl.router({
${slices.join('\n')}
})
`
}

function mcpFile() {
  const inject = 'inject: { tenantId: ({ context }) => context.tenantId }'
  let src = `import { all, bindTools, createToolkit } from '@ts-pf/mcp'
import { createMcpFactory } from '@ts-pf/mcp/sdk'
import { z } from 'zod'
import { app, type Ctx } from './app.js'
import { contract } from './contract.js'

const tk = createToolkit(contract).$context<Ctx>()
`
  for (const i of range(20)) {
    src += `const t_s${i} = tk.s${i}.p${i}.describe('d').effect('read').inject({ tenantId: ({ context }) => context.tenantId }).output(z.object({ id: z.string(), label: z.string() }), (o) => ({ id: o.id, label: o.name${i} })).errors({ NOT_FOUND: ({ data }) => data.id }).examples([{ id${i}: 'x', n: 1, tag: 'a' }])\n`
  }
  const shaped = range(20).map((i) => `tk.s${i}.p${i}`)
  src += `const flat = all(tk, { exclude: [${shaped.join(', ')}, tk.s17, tk.s18, tk.s19], ${inject} })\n`
  for (const h of [17, 18, 19]) {
    src += `const h${h} = tk.$host({ description: 'slice ${h}', split: 'effect', tools: all(tk.s${h}, { exclude: [tk.s${h}.p${h}], ${inject} }) })\n`
  }
  const named = range(20)
    .map((i) => `shaped_s${i}: t_s${i}`)
    .join(', ')
  src += `export const ts = tk.$toolset({ tools: [flat, { ${named} }], hosts: { s17: h17, s18: h18, s19: h19 } })
${TAGGED ? "export const tagged = tk.$toolset({ tools: all(tk.s16, { tags: ['t1'], inject: { tenantId: ({ context }) => context.tenantId } }) })\n" : ''}tk.$coverage({ toolsets: [ts${TAGGED ? ', tagged' : ''}] })
export const factory = createMcpFactory(bindTools(ts, { app, context: () => ({ tenantId: 't' }) }), { name: 'x', version: '1' })
export const factory2 = createMcpFactory(app, { name: 'x', version: '1', context: () => ({ tenantId: 't' }) })
`
  return src
}

const compilerOptions = {
  target: 'ES2022',
  module: 'Node16',
  moduleResolution: 'Node16',
  lib: ['ES2022', 'DOM'],
  types: ['node'],
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  isolatedModules: true,
  skipLibCheck: true,
  noEmit: true,
}

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'package.json'), '{ "type": "module" }\n')
writeFileSync(join(out, 'contract.ts'), contract())
writeFileSync(join(out, 'app.ts'), app())
writeFileSync(join(out, 'mcp.ts'), mcpFile())
for (const [name, files] of [
  ['baseline', ['contract.ts', 'app.ts']],
  ['full', ['contract.ts', 'app.ts', 'mcp.ts']],
]) {
  writeFileSync(
    join(out, `tsconfig.${name}.json`),
    `${JSON.stringify({ compilerOptions, files }, null, 2)}\n`,
  )
}

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')

function measure(name) {
  const text = execFileSync(
    process.execPath,
    [tsc, '-p', join(out, `tsconfig.${name}.json`), '--extendedDiagnostics'],
    { encoding: 'utf8' },
  )
  const read = (label) =>
    Number(new RegExp(`^${label}:\\s+([\\d.]+)`, 'm').exec(text)?.[1])
  return { check: read('Check time'), inst: read('Instantiations') }
}

function median(name) {
  const samples = range(runs).map(() => measure(name))
  const mid = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  return {
    check: mid(samples.map((s) => s.check)),
    inst: mid(samples.map((s) => s.inst)),
  }
}

const base = median('baseline')
const full = median('full')
const fmt = (n) => n.toLocaleString('en-US')
console.log(`median of ${runs} runs, ${SLICES * PER_SLICE} procedures`)
console.log(
  `baseline (contract + app): check ${base.check.toFixed(2)} s, ${fmt(base.inst)} instantiations`,
)
console.log(
  `full (+ @ts-pf/mcp):       check ${full.check.toFixed(2)} s, ${fmt(full.inst)} instantiations`,
)
console.log(
  `delta:                     +${(full.check - base.check).toFixed(2)} s, +${fmt(full.inst - base.inst)} instantiations`,
)
