import { defined } from '@ts-pf/protocol'
import type { MaybePromise } from './infer.js'

/** One inner tool as search sees it: its name and the words that describe it. */
export type SearchDocument = { id: string; text: string }

/** Per-query hooks the host passes to a `SearchIndex`. */
export type SearchContext = {
  /** The caller's abort signal, for a query that calls out (e.g. to embed). */
  signal?: AbortSignal
  /** Report a recovered failure (a ranker that fell back) through the binding's `onError`. */
  report(error: unknown): void
}

export interface SearchIndex {
  /** Matching ids, best first. A throw becomes an error result for the model. */
  search(
    query: string,
    ctx: SearchContext,
  ): readonly string[] | Promise<readonly string[]>
}

/** Builds one index per host bucket, once, when the toolset is bound. */
export type SearchFactory = (
  documents: readonly SearchDocument[],
) => SearchIndex

export type EmbedOptions = {
  /** Some models embed queries and documents differently (e5 `query:` / `passage:`, bge instructions). */
  kind: 'query' | 'document'
  /** Set for queries only; documents are embedded once and shared by every caller. */
  signal?: AbortSignal
}

/** One vector per text, in order, all the same length. `number[]` and `Float32Array` both work. */
export type Embed = (
  texts: readonly string[],
  options: EmbedOptions,
) => MaybePromise<readonly ArrayLike<number>[]>

export type DenseSearchOptions = {
  embed: Embed
  /** Keep tools whose cosine similarity to the query is above this. Default 0. */
  minScore?: number
}

const K1 = 1.2
const B = 0.75
/** The reciprocal rank fusion constant from the original paper. */
const RRF_K = 60

/** Lower-case word tokens; splits `snake_case`, `camelCase`, and punctuation. */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0)
}

/** BM25 over small documents (name, description, tags, aliases). Keeps only documents sharing a word with the query. */
export function createSearchIndex(documents: readonly SearchDocument[]): {
  search(query: string): string[]
} {
  const docs = documents.map((doc) => {
    const terms = new Map<string, number>()
    const tokens = tokenize(doc.text)
    for (const token of tokens) terms.set(token, (terms.get(token) ?? 0) + 1)
    return { id: doc.id, terms, length: tokens.length }
  })
  const avgLength =
    docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(docs.length, 1)
  const docFreq = new Map<string, number>()
  for (const doc of docs) {
    for (const term of doc.terms.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1)
    }
  }
  const idf = (term: string) => {
    const n = docFreq.get(term) ?? 0
    return Math.log(1 + (docs.length - n + 0.5) / (n + 0.5))
  }
  return {
    search(query) {
      const terms = [...new Set(tokenize(query))]
      return docs
        .map((doc) => {
          let score = 0
          for (const term of terms) {
            const tf = doc.terms.get(term) ?? 0
            if (tf === 0) continue
            const norm = 1 - B + (B * doc.length) / (avgLength || 1)
            score += (idf(term) * tf * (K1 + 1)) / (tf + K1 * norm)
          }
          return { id: doc.id, score }
        })
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((hit) => hit.id)
    },
  }
}

/** Keyword ranking, in-process and synchronous. The default. */
export function bm25Search(): SearchFactory {
  return createSearchIndex
}

/** Unit length, so cosine similarity is a dot product. A zero vector stays zero. */
function normalize(vector: ArrayLike<number>): Float32Array {
  const out = Float32Array.from(vector)
  let sum = 0
  for (const x of out) sum += x * x
  const norm = Math.sqrt(sum)
  if (norm > 0)
    for (let i = 0; i < out.length; i += 1) out[i] = (out[i] ?? 0) / norm
  return out
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0)
  return sum
}

/** Calls `embed` and checks what it returned: one non-empty vector per text, all one length. */
async function embedNormalized(
  embed: Embed,
  texts: readonly string[],
  options: EmbedOptions,
): Promise<Float32Array[]> {
  const vectors = await embed(texts, options)
  if (vectors.length !== texts.length) {
    throw new Error(
      `embed() returned ${vectors.length} vectors for ${texts.length} texts`,
    )
  }
  const size = vectors[0]?.length ?? 0
  if (size === 0 || vectors.some((vector) => vector.length !== size)) {
    throw new Error('embed() returned empty vectors or vectors of mixed length')
  }
  return vectors.map(normalize)
}

/**
 * Embedding (semantic) ranking with a function you supply: an in-process
 * model (transformers.js, ONNX) or a hosted API. Tool vectors are embedded on
 * the first query and kept in memory; a failed attempt is retried on the next
 * query. A query is one dot product per tool, so no vector store is involved.
 */
export function denseSearch(options: DenseSearchOptions): SearchFactory {
  const { embed, minScore = 0 } = options
  return (documents) => {
    let pending: Promise<{ id: string; vector: Float32Array }[]> | undefined
    const toolVectors = () => {
      pending ??= embedNormalized(
        embed,
        documents.map((doc) => doc.text),
        { kind: 'document' },
      ).then(
        (vectors) =>
          documents.map((doc, i) => ({
            id: doc.id,
            vector: vectors[i] ?? new Float32Array(),
          })),
        (error: unknown) => {
          pending = undefined
          throw error
        },
      )
      return pending
    }
    return {
      async search(query, ctx) {
        if (documents.length === 0) return []
        const [tools, [queryVector]] = await Promise.all([
          toolVectors(),
          embedNormalized(
            embed,
            [query],
            defined({ kind: 'query' as const, signal: ctx.signal }),
          ),
        ])
        if (!queryVector || queryVector.length !== tools[0]?.vector.length) {
          throw new Error(
            'embed() returned a query vector whose length differs from the tool vectors',
          )
        }
        return tools
          .map((tool) => ({
            id: tool.id,
            score: dot(queryVector, tool.vector),
          }))
          .filter((hit) => hit.score > minScore)
          .sort((a, b) => b.score - a.score)
          .map((hit) => hit.id)
      },
    }
  }
}

/** Reciprocal rank fusion: rank lists merge without comparing their scores. */
function fuseRanks(lists: readonly (readonly string[])[]): string[] {
  const scores = new Map<string, number>()
  for (const list of lists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1))
    })
  }
  return [...scores].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

/**
 * BM25 and `denseSearch` fused by reciprocal rank: exact words still count,
 * and a query that shares no words with a tool can still find it. If
 * `embed` fails, the failure goes to `onError` and BM25 results are returned.
 */
export function hybridSearch(options: DenseSearchOptions): SearchFactory {
  const dense = denseSearch(options)
  return (documents) => {
    const lexical = createSearchIndex(documents)
    const semantic = dense(documents)
    return {
      async search(query, ctx) {
        const words = lexical.search(query)
        try {
          return fuseRanks([words, await semantic.search(query, ctx)])
        } catch (error) {
          ctx.report(error)
          return words
        }
      },
    }
  }
}
