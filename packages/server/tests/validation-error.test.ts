import {
  procedure,
  router,
  toValidationIssues,
  validateSchema,
} from '@ts-pf/contract'
import { PFError } from '@ts-pf/protocol'
import {
  createImplementer,
  createLocalClient,
  runProcedure,
  validationError,
} from '@ts-pf/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const input = z.object({ n: z.number() })
const contract = router({ echo: procedure.input(input).output(input) })

describe('validationError', () => {
  it('is the same error runProcedure throws on a failed input check', async () => {
    const impl = createImplementer(contract)
    const app = impl.router({
      echo: impl.echo.handler(async ({ input }) => input),
    })
    const builtIn = (await runProcedure(app.echo, { n: 'x' }, {}).catch(
      (error: unknown) => error,
    )) as PFError
    const result = await validateSchema(input, { n: 'x' })
    if (result.success) throw new Error('expected failure')
    const built = validationError(result.issues)

    expect(built).toBeInstanceOf(PFError)
    expect(built.code).toBe(builtIn.code)
    expect(built.message).toBe(builtIn.message)
    expect(built.data).toEqual(builtIn.data)
    expect(built.status).toBe(builtIn.status)
    expect(built.status).toBeUndefined()
    expect(built.toJSON()).toEqual(builtIn.toJSON())
  })

  it('reports a handler-side check like the built-in one under validation.input: false', async () => {
    const impl = createImplementer(contract)
    const app = impl.router({
      echo: impl.echo.handler(async ({ input: raw }) => {
        const result = await input['~standard'].validate(raw)
        if (result.issues)
          throw validationError(toValidationIssues(result.issues))
        return result.value
      }),
    })
    const unchecked = createLocalClient(app, {
      context: {},
      validation: { input: false },
    })
    const checked = createLocalClient(app, { context: {} })
    const own = (await unchecked
      .echo({ n: 'x' } as never)
      .catch((e: unknown) => e)) as PFError
    const builtIn = (await checked
      .echo({ n: 'x' } as never)
      .catch((e: unknown) => e)) as PFError
    expect(own.toJSON()).toEqual(builtIn.toJSON())
    expect(own.status).toBe(builtIn.status)
  })
})
