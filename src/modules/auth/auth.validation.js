import { z } from 'zod';
import { AppError } from '../../common/errors/AppError.js';

// Password policy: At least 8 characters, 1 uppercase, 1 lowercase, 1 digit, 1 special char
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,128}$/;

export const registerSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, { message: 'Name must be at least 2 characters long' })
    .max(100, { message: 'Name must not exceed 100 characters' }),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email({ message: 'Invalid email address format' })
    .max(255, { message: 'Email must not exceed 255 characters' }),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, { message: 'Password must be at least 8 characters long' })
    .max(128, { message: 'Password must not exceed 128 characters' })
    .regex(
      PASSWORD_REGEX,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  // Optional patient profile fields
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
}).strict({ message: 'Unexpected field provided in registration payload. Privileged fields like role are forbidden.' });

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email({ message: 'Invalid email address format' }),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, { message: 'Password is required' })
}).strict();

export const refreshSchema = z.object({
  refreshToken: z
    .string()
    .optional()
});

export const mfaCodeSchema = z.object({
  code: z
    .string({ required_error: 'MFA code is required' })
    .trim()
    .regex(/^\d{6}$/, { message: 'MFA code must be exactly 6 digits' })
}).strict();

/**
 * Higher-order middleware to validate request body using a Zod schema.
 * Formats validation issues clearly into an AppError with code 'VALIDATION_ERROR'.
 */
export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }));

      const primaryMessage = result.error.issues[0]?.message || 'Request validation failed';

      return next(
        new AppError(
          primaryMessage,
          400,
          'VALIDATION_ERROR',
          fieldErrors
        )
      );
    }

    req.body = result.data;
    next();
  };
}
