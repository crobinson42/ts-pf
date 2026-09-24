import { procedure, router } from '@ts-pf/contract'
import {
  completeTask,
  createTask,
  getTask,
  listTasks,
  taskIdData,
  watchTasks,
} from '@ts-pf/example-clean-arch-app'
import { stream } from '@ts-pf/stream'
import { finishTasks } from './gateway.js'

const forbidden = { FORBIDDEN: { status: 403 } } as const

export const contract = router({
  task: {
    create: procedure
      .input(createTask.input)
      .output(createTask.output)
      .errors(forbidden),
    get: procedure
      .input(getTask.input)
      .output(getTask.output)
      .errors({
        ...forbidden,
        NOT_FOUND: { status: 404, data: taskIdData },
      }),
    list: procedure.output(listTasks.output),
    complete: procedure
      .input(completeTask.input)
      .output(completeTask.output)
      .errors({
        ...forbidden,
        NOT_FOUND: { status: 404, data: taskIdData },
        ALREADY_COMPLETE: { status: 409, data: taskIdData },
      }),
    watch: procedure.output(stream(watchTasks.item)).errors(forbidden),
    finish: finishTasks.contract,
  },
})
