import { procedure, router } from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import {
  createImplementer,
  createLocalClient,
  runProcedure,
} from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const contract = router({
  ping: procedure.output(z.string()),
  echo: procedure
    .input(z.object({ n: z.number() }))
    .output(z.object({ n: z.number() })),
  bare: procedure,
})

function app() {
  const impl = createImplementer(contract)
  return impl.router({
    ping: impl.ping.handler(async () => 1 as never),
    echo: impl.echo.handler(async ({ input }) => input),
    bare: impl.bare.handler(async () => 1),
  })
}

describe('runProcedure validation', () => {
  it('checks input and skips output by default', async () => {
    const routerApp = app()
    await expect(
      runProcedure(routerApp.echo, { n: 'x' }, {}),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(await runProcedure(routerApp.ping, undefined, {})).toBe(1)
  })

  it('checks output when validation.output is true', async () => {
    await expect(
      runProcedure(app().ping, undefined, {}, { validation: { output: true } }),
    ).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('skips input when validation.input is false', async () => {
    expect(
      await runProcedure(
        app().echo,
        { n: 'x' },
        {},
        { validation: { input: false } },
      ),
    ).toEqual({ n: 'x' })
  })

  it('applies both flags together', async () => {
    const err = await runProcedure(
      app().ping,
      undefined,
      {},
      { validation: { input: false, output: true } },
    ).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(err).toBeInstanceOf(PFError)
    expect(err).toMatchObject({ code: 'INTERNAL' })
    expect((err as PFError).data).toBeUndefined()
  })

  it('returns the handler value when output checks are on and there is no output schema', async () => {
    expect(
      await runProcedure(
        app().bare,
        undefined,
        {},
        { validation: { output: true } },
      ),
    ).toBe(1)
  })

  it('forwards validation through createLocalClient', async () => {
    const client = createLocalClient(app(), {
      context: {},
      validation: { input: false },
    })
    expect(await client.echo({ n: 'x' } as never)).toEqual({ n: 'x' })
  })
})
