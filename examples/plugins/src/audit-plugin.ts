import type { CallInterceptor, CallPlugin } from '@ts-pf/server'

export type AuditEntry = {
  path: string
  ok: boolean
}

/** Named interceptor around `runProcedure`. `name` is debugging, not a registry. */
export class AuditPlugin implements CallPlugin {
  readonly name = 'audit'
  readonly entries: AuditEntry[] = []
  readonly intercept: CallInterceptor

  constructor() {
    this.intercept = async (ctx) => {
      try {
        const output = await ctx.next()
        this.entries.push({ path: ctx.path.join('.'), ok: true })
        return output
      } catch (error) {
        this.entries.push({ path: ctx.path.join('.'), ok: false })
        throw error
      }
    }
  }

  clear() {
    this.entries.length = 0
  }
}

export const audit = new AuditPlugin()
