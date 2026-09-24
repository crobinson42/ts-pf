import { z } from 'zod'

export const taskDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  completedAt: z.string().nullable(),
})

export type TaskData = z.infer<typeof taskDataSchema>
