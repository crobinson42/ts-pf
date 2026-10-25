import { writeFileSync } from 'node:fs'
const hdr = `import { z } from 'zod'\nimport { all, bindTools, createMcpFactory, createToolkit } from '../src/mcp2.js'\nimport { contract } from './contract.js'\nimport { app, type Ctx } from './app.js'\nconst tk = createToolkit(contract).$context<Ctx>()\nconst inj = { tenantId: ({ context }: { context: Ctx }) => context.tenantId }\n`
let r = hdr
for (let i = 0; i < 20; i++)
  r += `const t_s${i} = tk.s${i}.p${i}.describe('d').effect('read').inject({ tenantId: ({ context }) => context.tenantId }).output(z.object({ id: z.string(), label: z.string() }), (o) => ({ id: o.id, label: o.name${i} })).errors({ NOT_FOUND: ({ data }) => data.id }).examples([{ id${i}: 'x', n: 1, tag: 'a' }])\n`
const shapedEx = [...Array(20)].map((_, i) => `tk.s${i}.p${i}`)
r += `const flat = all(tk, { exclude: [${shapedEx.join(', ')}, tk.s17, tk.s18, tk.s19], inject: { tenantId: ({ context }) => context.tenantId } })\n`
for (const h of [17, 18, 19])
  r += `const h${h} = tk.$host({ description: 'slice ${h}', split: 'effect', tools: all(tk.s${h}, { exclude: [tk.s${h}.p${h}], inject: { tenantId: ({ context }) => context.tenantId } }) })\n`
r += `export const ts = tk.$toolset({ tools: [flat, { ${[...Array(20)].map((_, i) => `shaped_s${i}: t_s${i}`).join(', ')} }], hosts: { s17: h17, s18: h18, s19: h19 } })\n`
r += `tk.$coverage({ toolsets: [ts] })\n`
r += `export const factory = createMcpFactory(bindTools(ts, { app, context: () => ({ tenantId: 't' }) }), { name: 'x', version: '1' })\n`
r += `export const factory2 = createMcpFactory(app, { name: 'x', version: '1', context: () => ({ tenantId: 't' }) })\n`
writeFileSync('perf/r2.ts', r)
writeFileSync('perf/r2-allinject.ts', hdr + `export const flat = all(tk, { inject: { tenantId: ({ context }) => context.tenantId } })\nexport type K = keyof typeof flat\n`)
writeFileSync('perf/r2-noinject.ts', r.replace(/, inject: \{ tenantId: \(\{ context \}\) => context\.tenantId \} \}\)/g, ' })'))
