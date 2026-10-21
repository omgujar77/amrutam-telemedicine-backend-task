import { z } from 'zod';

export const createSlotSchema = z.object({
  startTime: z.string().datetime({ message: 'startTime must be a valid ISO 8601 datetime string' }),
  endTime: z.string().datetime({ message: 'endTime must be a valid ISO 8601 datetime string' })
}).refine(
  (data) => new Date(data.endTime) > new Date(data.startTime),
  { message: 'endTime must be strictly later than startTime', path: ['endTime'] }
).refine(
  (data) => new Date(data.startTime) >= new Date(),
  { message: 'startTime cannot be in the past', path: ['startTime'] }
);

export const listDoctorSlotsQuerySchema = z.object({
  status: z.enum(['AVAILABLE', 'RESERVED', 'BOOKED', 'CANCELLED']).optional(),
  date: z.string().optional()
});
