import { z } from 'zod'

export const TestCaseSchema = z.object({
  name: z.string().min(1),
  args: z.array(z.unknown()),
  expected: z.unknown(),
  timeoutMs: z.number().int().min(50).max(3000).default(1000),
})

export const ExerciseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  kind: z.enum(['algorithm', 'frontend']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  language: z.literal('javascript'),
  topics: z.array(z.string()).min(1),
  prompt: z.string().min(1),
  starterCode: z.string(),
  publicTests: z.array(TestCaseSchema).min(1),
  hiddenTests: z.array(TestCaseSchema),
  legacy: z.object({
    status: z.string(),
    complexity: z.string(),
    mistakes: z.array(z.string()),
    questions: z.array(z.string()),
  }).passthrough().optional(),
})

export type Exercise = z.infer<typeof ExerciseSchema>
export type ExerciseKind = Exercise['kind']
