/**
 * Host discovery by meaning: the same `planetsMcp` toolset, bound with
 * `hybridSearch`, so a query like "destroy world" finds `planet_remove`
 * ("Delete a planet permanently") although they share no words. BM25 alone
 * returns nothing for it.
 *
 * `embed` is yours. It can run in-process; no vector database is involved
 * (each query is one dot product per tool). With transformers.js
 * (`npm i @huggingface/transformers`, which installs onnxruntime-node):
 *
 *   import { pipeline } from '@huggingface/transformers'
 *
 *   const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' })
 *   const embed: Embed = async (texts) =>
 *     (await extractor([...texts], { pooling: 'mean', normalize: true })).tolist()
 *
 *   export const factory = vectorSearchFactory(embed)
 *
 * The model downloads on first use (set `env.cacheDir`, or ship the files);
 * `onnxruntime-node` is native, so this runs on Node, not on edge runtimes.
 * The smoke test passes a small deterministic `embed` instead.
 */
import { bindTools, type Embed, hybridSearch } from '@ts-pf/mcp'
import { createMcpFactory } from '@ts-pf/mcp/sdk'
import { app } from './app.js'
import { contextFrom, planetsMcp } from './mcp.js'

export function vectorSearchTools(embed: Embed) {
  return bindTools(planetsMcp, {
    app,
    context: contextFrom,
    search: hybridSearch({ embed }),
  })
}

export function vectorSearchFactory(embed: Embed) {
  return createMcpFactory(vectorSearchTools(embed), {
    name: 'planets',
    version: '1.0.0',
    instructions: 'Planet catalog for the caller workspace.',
  })
}
