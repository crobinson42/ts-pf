export const PHANTOM_SOURCE = `type Phantom<T> = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: 'ts-pf-codegen'
    readonly types: { readonly input: T; readonly output: T }
    readonly validate: (value: unknown) => { readonly value: T }
  }
}`
