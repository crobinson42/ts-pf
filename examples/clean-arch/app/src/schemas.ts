import { z } from 'zod'

export const taskViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
})

export type TaskView = z.infer<typeof taskViewSchema>

export const createTaskInputSchema = z.object({
  title: z.string().trim().min(1),
})

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>

export const taskIdData = z.object({
  id: z.string().min(1),
})

export const taskIdInputSchema = taskIdData

export type TaskIdInput = z.infer<typeof taskIdInputSchema>
