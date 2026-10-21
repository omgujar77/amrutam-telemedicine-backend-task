import { z } from 'zod';

export const createBookingSchema = z.object({
  slotId: z.string().trim().min(1, { message: 'slotId is required' })
}).strict();

export const listBookingsQuerySchema = z.object({
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10)
});

export const cancelBookingSchema = z.object({
  cancellationReason: z.string().trim().max(500).optional()
}).strict();
