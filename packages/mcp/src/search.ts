export type SearchDocument = { id: string; text: string }

export interface SearchIndex {
  /** Ids with a positive BM25 score, best first. */
  search(query: string): string[]
}

const K1 = 1.2
const B = 0.75

/** Lower-case word tokens; splits `snake_case`, `camelCase`, and punctuation. */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0)
}

/** BM25 over small documents (name, description, tags, aliases). Built once per host bucket. */
export function createSearchIndex(
  documents: readonly SearchDocument[],
): SearchIndex {
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
