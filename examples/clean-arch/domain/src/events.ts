import { z } from 'zod'

export const taskCreatedSchema = z.object({
  type: z.literal('task.created'),
  taskId: z.string(),
  title: z.string(),
})

export const taskCompletedSchema = z.object({
  type: z.literal('task.completed'),
  taskId: z.string(),
  completedAt: z.string(),
})

export const domainEventSchema = z.discriminatedUnion('type', [
  taskCreatedSchema,
  taskCompletedSchema,
])

export type DomainEvent = z.infer<typeof domainEventSchema>
