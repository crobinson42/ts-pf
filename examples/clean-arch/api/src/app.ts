import {
  type AppDeps,
  type Caller,
  completeTask,
  createTask,
  getTask,
  listTasks,
  watchTasks,
} from '@ts-pf/example-clean-arch-app'
import { createImplementer } from '@ts-pf/server'
import { contract } from './contract.js'
import { finishTasks } from './gateway.js'

export type Context = { deps: AppDeps; caller: Caller }

const impl = createImplementer(contract).$context<Context>()

export const app = impl.router({
  task: {
    create: createTask.mount(impl.task.create, (errors) => ({
      FORBIDDEN: () => errors.FORBIDDEN(),
    })),
    get: getTask.mount(impl.task.get, (errors) => ({
      FORBIDDEN: () => errors.FORBIDDEN(),
      NOT_FOUND: (data) => errors.NOT_FOUND(data),
    })),
    list: listTasks.mount(impl.task.list),
    complete: completeTask.mount(impl.task.complete, (errors) => ({
      FORBIDDEN: () => errors.FORBIDDEN(),
      NOT_FOUND: (data) => errors.NOT_FOUND(data),
      ALREADY_COMPLETE: (data) => errors.ALREADY_COMPLETE(data),
    })),
    watch: watchTasks.mount(impl.task.watch, (errors) => ({
      FORBIDDEN: () => errors.FORBIDDEN(),
    })),
    finish: finishTasks.mount(impl.task.finish),
  },
})
