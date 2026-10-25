import { all, bindTools, createToolkit, type McpCallInfo } from '@ts-pf/mcp'
import { createMcpFactory } from '@ts-pf/mcp/sdk'
import { z } from 'zod'
import { type AppCtx, app } from './app.js'
import { contract } from './contract.js'

const tk = createToolkit(contract).$context<AppCtx>()
const workspace = {
  workspaceId: ({ context }: { context: AppCtx }) => context.workspaceId,
}

// Shaped tool: workspace hidden from the model, a reshaped result with outputSchema.
const findPlanet = tk.planet.find
  .describe(
    'Get one planet by id. If you only have a name, call get_planets_query_capabilities first.',
  )
  .inject(workspace)
  .output(
    z.object({ id: z.number(), name: z.string(), summary: z.string() }),
    (p) => ({
      id: p.id,
      name: p.name,
      summary: `${p.name} has ${p.moons} moon${p.moons === 1 ? '' : 's'}${p.discoveredBy ? `, discovered by ${p.discoveredBy}` : ''}.`,
    }),
  )
  .errors({
    NOT_FOUND: ({ data }) =>
      `No planet with id ${data.id}. Call call_planets_query_capability with name "planet_list" to see ids.`,
  })
  .examples([{ id: 2 }])

export const planetsMcp = tk.$toolset({
  tools: {
    planet_find: findPlanet,
    ops_stats: tk.ops.stats.inject(workspace),
  },
  hosts: {
    // split: 'effect' (default) → query (read) and operations (write + destructive)
    planets: tk.$host({
      description: 'Planets in this workspace: list, rename, delete.',
      tools: all(tk.planet, { exclude: [tk.planet.find], inject: workspace }),
    }),
  },
})

// A new procedure fails this line until someone exposes or excludes it.
tk.$coverage({ toolsets: [planetsMcp] })

/** Identity comes from the verified token, never from headers or model input. */
export const contextFrom = (info: McpCallInfo): AppCtx => ({
  workspaceId: info.authInfo?.clientId ?? 'anonymous',
  scopes: info.authInfo?.scopes ?? [],
})

export const tools = bindTools(planetsMcp, { app, context: contextFrom })

export const factory = createMcpFactory(tools, {
  name: 'planets',
  version: '1.0.0',
  instructions: 'Planet catalog for the caller workspace.',
})
