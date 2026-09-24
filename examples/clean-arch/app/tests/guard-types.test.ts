import { expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { Caller } from '../src/caller.js'
import { forbidden } from '../src/guards/forbidden.js'
import { requireActor } from '../src/guards/require-actor.js'
import { requireCanComplete } from '../src/guards/require-can-complete.js'
import type { Access } from '../src/ports/access.js'
import type { FailMap } from '../src/rejected.js'
import { useCase } from '../src/use-case.js'

const narrowsActor = useCase('narrows actor')
  .deps<{ access: Access }>()
  .caller(requireActor)
  .input(z.object({ id: z.string() }))
  .caller(requireCanComplete)
  .output(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
  .run(({ caller, input }) => {
    expectTypeOf(caller.actorId).toEqualTypeOf<string>()
    expectTypeOf(caller.traceId).toEqualTypeOf<string>()
    expectTypeOf(input.id).toEqualTypeOf<string>()
    return { id: input.id }
  })

type OwnedFailure = Extract<
  Awaited<ReturnType<typeof narrowsActor>>,
  { ok: false }
>['error']
type OwnedMap = FailMap<Exclude<OwnedFailure, { code: 'INVALID' }>>

const ownedMap: OwnedMap = {
  FORBIDDEN: () => undefined as never,
  NOT_FOUND: () => undefined as never,
}
void ownedMap
void narrowsActor

it('guards are use-case-guard values', () => {
  expect(requireActor.kind).toBe('use-case-guard')
  expect(requireCanComplete.kind).toBe('use-case-guard')
  expect(requireActor.failures).toBe(forbidden)
  expect(requireCanComplete.failures).toBe(forbidden)
})

export function illegalGuardChains(): void {
  useCase('reads input too early')
    .deps<{ access: Access }>()
    // @ts-expect-error requireCanComplete reads input before .input()
    .caller(requireCanComplete)

  useCase('deps missing access')
    .deps<{ tasks: { get(id: string): Promise<unknown> } }>()
    .caller(requireActor)
    .input(z.object({ id: z.string() }))
    // @ts-expect-error deps has no access
    .caller(requireCanComplete)

  useCase('actor still nullable')
    .deps<{ access: Access }>()
    .input(z.object({ id: z.string() }))
    // @ts-expect-error actorId is still string | null
    .caller(requireCanComplete)

  const rawPositional: (
    caller: Caller,
    deps: { access: Access },
    input: { id: string },
  ) => Promise<true> = async () => true
  useCase('raw positional callback')
    // @ts-expect-error raw positional function
    .caller(rawPositional)

  useCase('input shape mismatch')
    .deps<{ access: Access }>()
    .caller(requireActor)
    .input(z.object({ taskId: z.string() }))
    // @ts-expect-error parsed input has no id
    .caller(requireCanComplete)

  useCase('restate guard code')
    .caller(requireActor)
    // @ts-expect-error FORBIDDEN is already declared by a guard
    .errors(forbidden)

  const richer = useCase.guard
    .errors({ FORBIDDEN: { data: z.object({ reason: z.string() }) } })
    .narrow((ctx): ctx is { caller: Caller; errors: typeof ctx.errors } => {
      ctx.errors.FORBIDDEN({ reason: 'no' })
      return true
    })
  useCase('payload clash')
    .caller(requireActor)
    // @ts-expect-error FORBIDDEN payload differs
    .caller(richer)

  // @ts-expect-error FORBIDDEN branch is required
  const omitted: OwnedMap = {
    NOT_FOUND: () => undefined as never,
  }
  void omitted

  useCase.guard
    .errors(forbidden)
    .narrow((ctx): ctx is { caller: Caller; errors: typeof ctx.errors } => {
      // @ts-expect-error this guard does not declare NOT_FOUND
      ctx.errors.NOT_FOUND()
      return true
    })
}
