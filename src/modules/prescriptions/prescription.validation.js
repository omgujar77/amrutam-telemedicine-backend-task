import { z } from 'zod';

export const medicineItemSchema = z.object({
  name: z.string().trim().min(1, { message: 'Medicine name is required' }).max(100),
  dosage: z.string().trim().min(1, { message: 'Dosage is required' }).max(50),
  frequency: z.string().trim().min(1, { message: 'Frequency is required' }).max(50),
  duration: z.string().trim().min(1, { message: 'Duration is required' }).max(50)
});

export const createPrescriptionSchema = z.object({
  medicines: z
    .array(medicineItemSchema)
    .min(1, { message: 'Prescription must contain at least one medicine' })
    .max(20, { message: 'Prescription cannot exceed 20 medicines' }),
  dosageInstructions: z
    .string()
    .trim()
    .min(1, { message: 'Dosage instructions are required' })
    .max(1000),
  advice: z
    .string()
    .trim()
    .max(1000)
    .optional()
}).strict();

export const listPrescriptionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10)
});
