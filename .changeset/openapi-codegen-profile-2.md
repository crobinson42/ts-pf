---
"@ts-pf/openapi": minor
---

Complete the codegen profile. `profile: 'codegen'` now also sets:

- `hoist: 'objects'`: nested inline objects with properties become named components (`BookFindOutputAuthor`; array items `…Item`, record values `…Value`, union variants by tag value). Identical shapes share one component. Protocol envelopes keep their inline objects. A warning lists the made-up names, so you can give those objects a `.meta({ id })`.
- `discriminators: true`: `discriminator: { propertyName, mapping }` on unions of components that each require a different string tag.
- `canonical: true`: keys sorted at every depth, using `canonicalize` from `@ts-pf/docs`, so output is byte-stable.

New options the profile never sets:

- `streams: 'operation' | 'components' | 'omit'`. `'components'` gives stream procedures no path and lists their schemas in a document-level `x-ts-pf-streams` map, for streams served over message transports. `'omit'` leaves them out.
- `enumNames`: names shared inline enums by value set (`{ BookStatus: ['available', 'loaned'] }`).
- `catalogHash`: written to `info['x-ts-pf-catalog-hash']`. Pass `catalogHash(catalog)` from `@ts-pf/codegen`.

The default output is unchanged.
