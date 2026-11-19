import { canonicalize, type ProcedureCatalog } from '@ts-pf/docs'
import { closeInputs } from './close-inputs.js'
import { constAsEnum } from './const-enum.js'
import { discriminators } from './discriminators.js'
import { type EnumNames, enumNames } from './enum-names.js'
import { dropFormatPatterns } from './format-patterns.js'
import { hoistObjects } from './hoist-objects.js'
import { pascalNames } from './naming.js'
import type { OpenAPIDocument, OpenAPIOptions } from './types.js'

type ProfileKey =
  | 'envelopes'
  | 'errors'
  | 'naming'
  | 'closeInputs'
  | 'constAsEnum'
  | 'dropFormatPatterns'
  | 'emptyInputNull'
  | 'discriminators'
  | 'hoist'
  | 'canonical'
  | 'streams'

/** Every profile option with its value settled. */
export type ResolvedProfile = {
  [K in ProfileKey]-?: Exclude<OpenAPIOptions[K], undefined>
}

const DEFAULTS: ResolvedProfile = {
  envelopes: 'components',
  errors: 'per-code',
  naming: 'path',
  closeInputs: false,
  constAsEnum: false,
  dropFormatPatterns: false,
  emptyInputNull: false,
  discriminators: false,
  hoist: 'none',
  canonical: false,
  streams: 'operation',
}

const PROFILES: Record<
  Exclude<OpenAPIOptions['profile'], undefined>,
  ResolvedProfile
> = {
  codegen: {
    envelopes: 'inline',
    errors: 'shared',
    naming: 'pascal',
    closeInputs: true,
    constAsEnum: 'exceptTags',
    dropFormatPatterns: true,
    emptyInputNull: true,
    discriminators: true,
    hoist: 'objects',
    canonical: true,
    // The catalog cannot tell message-only streams from HTTP ones, so the
    // profile keeps them as operations; `streams` is the user's statement.
    streams: 'operation',
  },
}

/** The profile's values (or the defaults), overridden by explicit options. */
export function resolveProfile(options: OpenAPIOptions): ResolvedProfile {
  const base = profileBase(options.profile)
  return {
    envelopes: options.envelopes ?? base.envelopes,
    errors: options.errors ?? base.errors,
    naming: options.naming ?? base.naming,
    closeInputs: options.closeInputs ?? base.closeInputs,
    constAsEnum: options.constAsEnum ?? base.constAsEnum,
    dropFormatPatterns: options.dropFormatPatterns ?? base.dropFormatPatterns,
    emptyInputNull: options.emptyInputNull ?? base.emptyInputNull,
    discriminators: options.discriminators ?? base.discriminators,
    hoist: options.hoist ?? base.hoist,
    canonical: options.canonical ?? base.canonical,
    streams: options.streams ?? base.streams,
  }
}

function profileBase(profile: string | undefined): ResolvedProfile {
  if (profile === undefined) {
    return DEFAULTS
  }
  if (!Object.hasOwn(PROFILES, profile)) {
    throw new Error(`openapi(): unknown profile "${profile}"`)
  }
  return PROFILES[profile as keyof typeof PROFILES]
}

/**
 * The passes that rewrite the assembled document, in this order:
 *
 * 1. `naming`: final names for the derived components;
 * 2. `enumNames`: named enums (a name clash is checked against step 1);
 * 3. `closeInputs`, `dropFormatPatterns`, `constAsEnum`: shape rewrites;
 * 4. `hoist`: nested objects, named after their parent's final name and
 *    shared on their final shape;
 * 5. `discriminators`: sees final names, hoisted variants, and tags that
 *    `constAsEnum` left as `const` (or source one-value enums);
 * 6. `canonical`: sorts keys, last.
 *
 * Each is off by default, so the default document is returned untouched.
 * `dataComponents` names the components that hold catalog schemas (not
 * protocol envelopes), before renaming.
 */
export function applySchemaPasses(
  document: OpenAPIDocument,
  catalog: ProcedureCatalog,
  profile: ResolvedProfile,
  passes: { dataComponents: Set<string>; enumNames?: EnumNames },
): OpenAPIDocument {
  let dataComponents = passes.dataComponents
  if (profile.naming === 'pascal') {
    const renames = pascalNames(document, catalog)
    dataComponents = new Set(
      [...dataComponents].map((name) => renames.get(name) ?? name),
    )
  }
  if (passes.enumNames !== undefined) {
    enumNames(document, passes.enumNames)
  }
  if (profile.closeInputs) {
    closeInputs(document)
  }
  if (profile.dropFormatPatterns) {
    dropFormatPatterns(document)
  }
  if (profile.constAsEnum === 'exceptTags') {
    constAsEnum(document)
  }
  if (profile.hoist === 'objects') {
    hoistObjects(document, dataComponents, profile.naming)
  }
  if (profile.discriminators) {
    discriminators(document)
  }
  return profile.canonical ? canonicalize(document) : document
}
