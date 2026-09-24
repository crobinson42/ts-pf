import { z } from 'zod'
import { taskViewSchema } from './schemas.js'

export const taskChangedSchema = z.object({
  type: z.literal('task.changed'),
  task: taskViewSchema,
})

export const clientEventSchema = z.discriminatedUnion('type', [
  taskChangedSchema,
])

export type ClientEvent = z.infer<typeof clientEventSchema>
