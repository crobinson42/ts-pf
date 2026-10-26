---
"@ts-pf/server-http": patch
---

`RequestLimitPlugin` builds its wrapped request from the URL plus `method`, `headers`, and `signal` instead of `new Request(request, init)`, so it works behind srvx on Node, whose request passes `instanceof Request` but cannot be cloned by undici (every call with a body answered `500 INTERNAL` with `Cannot read private member #state`). No srvx `patchGlobalRequest()` (`srvx/node`) is needed.
