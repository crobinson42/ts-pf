---
"@ts-pf/openapi": patch
"@ts-pf/sse": patch
"@ts-pf/swr": patch
"@ts-pf/codegen": patch
---

Internal: symbols used only inside their own module are no longer `export`ed (`sanitizeSegment`, `OpenAPIServer`, `OpenAPIMediaType`, `OpenAPIResponseHeader`, `OpenAPIParameter`, `OpenAPIRef`, `SseEvent`, `DeepPartial`, `PrintResult`, `ProcNode`, `NsNode`). None were reachable from the package entry points, so the public API is unchanged.
