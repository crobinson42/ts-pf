---
"@ts-pf/protocol": patch
---

`PROTOCOL.md` is now revision 1.2, written so a client in any language can be built from it alone. It adds RFC 2119 keywords, one-screen HTTP and WebSocket client checklists, a normative "Classifying an HTTP response" section (a body that does not decode as an envelope is a transport failure, never an application outcome read off the HTTP status), WebSocket close-code ranges (4900–4999 reserved for the protocol, 4400–4499 recommended for applications), non-normative notes on reconnecting and on sending a credential as `hello.meta.authorization`, and an appendix that collects the TypeScript client's own conventions (`local`, `status: 0`, error messages). No frame, key, header, or code changes, and the TypeScript packages already conform. The one behaviour change is in the message transports: a `hello-error` now carries a `PFError` thrown while accepting the hello (see `@ts-pf/message`).
