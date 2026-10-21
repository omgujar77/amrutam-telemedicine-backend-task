import { z } from 'zod';

export const updateMeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: 'Name must be at least 2 characters long' })
    .max(100, { message: 'Name must not exceed 100 characters' })
    .optional()
}).strict({ message: 'Modifying privileged fields (role, status, email, password) via profile update is strictly prohibited' });

export const updatePatientProfileSchema = z.object({
  dateOfBirth: z
    .string()
    .datetime({ message: 'dateOfBirth must be a valid ISO 8601 date string' })
    .optional(),
  gender: z
    .string()
    .max(20)
    .optional(),
  phoneNumber: z
    .string()
    .max(20)
    .optional(),
  emergencyContact: z
    .string()
    .max(100)
    .optional(),
  bloodGroup: z
    .string()
    .max(10)
    .optional(),
  allergies: z
    .string()
    .max(500)
    .optional()
}).strict({ message: 'Only permitted patient demographic fields can be updated' });

export const updateDoctorProfileSchema = z.object({
  qualifications: z
    .string()
    .min(2)
    .max(255)
    .optional(),
  specialization: z
    .string()
    .min(2)
    .max(255)
    .optional(),
  experienceYears: z
    .number()
    .int()
    .min(0)
    .max(80)
    .optional(),
  bio: z
    .string()
    .max(2000)
    .optional(),
  consultationFee: z
    .number()
    .positive({ message: 'Consultation fee must be greater than zero' })
    .optional()
}).strict({ message: 'Modifying verificationStatus directly is prohibited; doctor verification requires admin approval' });
