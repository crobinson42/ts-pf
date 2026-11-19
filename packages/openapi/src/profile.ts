import type { ProcedureCatalog } from '@ts-pf/docs'
import { closeInputs } from './close-inputs.js'
import { constAsEnum } from './const-enum.js'
import { dropFormatPatterns } from './format-patterns.js'
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
 * The passes that rewrite the assembled document. Each is off by default,
 * so the default document is returned untouched.
 */
export function applySchemaPasses(
  document: OpenAPIDocument,
  catalog: ProcedureCatalog,
  profile: ResolvedProfile,
): void {
  if (profile.naming === 'pascal') {
    pascalNames(document, catalog)
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
}
