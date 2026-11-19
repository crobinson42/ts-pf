---
"@ts-pf/stream": patch
"@ts-pf/sse": patch
---

Stream producers are closed reliably. With `validation.output: true`, a client cancel before the first item now reaches the handler's iterator (the item-validation wrapper forwards `return()` instead of completing on its own). A rejecting `return()` on cancel is no longer an unhandled rejection, and an item that cannot be encoded (a nested stream, a `Blob`, a `BigInt`) now calls the producer's `return()` once before the in-band failure. Put cleanup on the handler's `signal`: an async generator that was never pulled does not run its `finally` when `return()` is called.
