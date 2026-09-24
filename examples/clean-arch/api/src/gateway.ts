import { procedure } from '@ts-pf/contract'
import {
  type AppDeps,
  type Caller,
  completeTask,
  settle,
  type TaskView,
  taskIdData,
  taskViewSchema,
} from '@ts-pf/example-clean-arch-app'
import { z } from 'zod'

const finishInput = z.object({
  taskIds: z.array(z.string()).min(1),
})

const finishOutput = z.array(taskViewSchema)

const finishErrors = {
  FORBIDDEN: { status: 403 },
  NOT_FOUND: { status: 404, data: taskIdData },
  ALREADY_COMPLETE: { status: 409, data: taskIdData },
} as const

type Context = { deps: AppDeps; caller: Caller }

type WireErrors = {
  FORBIDDEN: () => never
  NOT_FOUND: (data: { id: string }) => never
  ALREADY_COMPLETE: (data: { id: string }) => never
}

export const finishTasks = {
  summary: 'Complete each task in a client batch',
  contract: procedure
    .input(finishInput)
    .output(finishOutput)
    .errors(finishErrors),
  mount<R>(procedureBuilder: {
    handler: (
      fn: (ctx: {
        input: z.infer<typeof finishInput>
        context: Context
        errors: WireErrors
        signal?: AbortSignal
      }) => Promise<TaskView[]>,
    ) => R
  }): R {
    return procedureBuilder.handler(async (ctx) => {
      const done: TaskView[] = []
      for (const id of ctx.input.taskIds) {
        if (ctx.signal?.aborted) {
          return done
        }
        const result = await completeTask({
          deps: ctx.context.deps,
          caller: ctx.context.caller,
          input: { id },
        })
        done.push(
          settle(result, {
            FORBIDDEN: () => ctx.errors.FORBIDDEN(),
            NOT_FOUND: (data) => ctx.errors.NOT_FOUND(data),
            ALREADY_COMPLETE: (data) => ctx.errors.ALREADY_COMPLETE(data),
          }),
        )
      }
      return done
    })
  },
}
