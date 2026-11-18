---
"@ts-pf/mcp": minor
---

Pluggable host search. `bindTools(toolset, { search })` takes a `SearchFactory`: `bm25Search()` (the default, unchanged), `denseSearch({ embed, minScore? })`, or `hybridSearch({ embed, minScore? })` (BM25 and embeddings merged by reciprocal rank fusion). `embed(texts, { kind, signal })` is supplied by the app, so it can be an in-process model (transformers.js) or a hosted API, and `@ts-pf/mcp` adds no dependency. Tool vectors are embedded on the first query and cached; no vector database is involved. `hybridSearch` falls back to BM25 when `embed` fails and reports the error to `onError`; `denseSearch` returns an error result. The README now documents host discovery arguments, defaults, and results, and corrects what `onError` receives.
