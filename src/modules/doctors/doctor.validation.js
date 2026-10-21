import { z } from 'zod';

export const searchDoctorsQuerySchema = z.object({
  search: z.string().trim().optional(),
  name: z.string().trim().optional(),
  q: z.string().trim().optional(),
  specialization: z.string().trim().optional(),
  verificationStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  availableDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'availableDate must be formatted as YYYY-MM-DD'
  }).optional(),
  maxFee: z.coerce.number().min(0, { message: 'maxFee must be a non-negative number' }).optional(),
  minExperience: z.coerce.number().int().min(0, { message: 'minExperience must be a non-negative integer' }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10)
});

export const getDoctorAvailabilityQuerySchema = z.object({
  date: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20)
});

export const listDoctorsQuerySchema = searchDoctorsQuerySchema;
