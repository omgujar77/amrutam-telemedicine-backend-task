import { z } from 'zod';

export const listConsultationsQuerySchema = z.object({
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10)
});

export const completeConsultationSchema = z.object({
  notes: z.string().trim().max(2000).optional()
}).strict();
