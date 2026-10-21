import { z } from 'zod';

export const verifyDoctorSchema = z.object({
  verificationStatus: z.enum(['VERIFIED', 'REJECTED'])
}).strict();

export const listAuditLogsQuerySchema = z.object({
  action: z.string().trim().optional(),
  entityType: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20)
});

export const analyticsOverviewQuerySchema = z.object({
  window: z.enum(['7d', '30d', '90d']).default('30d'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});
