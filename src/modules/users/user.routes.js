import { Router } from 'express';
import { userController } from './user.controller.js';
import { updateMeSchema, updatePatientProfileSchema, updateDoctorProfileSchema } from './user.validation.js';
import { validateBody } from '../auth/auth.validation.js';
import { authenticate, authorize } from '../auth/auth.middleware.js';

export const userRouter = Router();

// Base profile endpoints (Accessible by all authenticated users)
userRouter.get('/me', authenticate, userController.getMe);
userRouter.patch('/me', authenticate, validateBody(updateMeSchema), userController.updateMe);

// Patient-specific profile endpoints (Enforced with RBAC: role must be 'PATIENT')
userRouter.get(
  '/me/patient-profile',
  authenticate,
  authorize('PATIENT'),
  userController.getPatientProfile
);
userRouter.patch(
  '/me/patient-profile',
  authenticate,
  authorize('PATIENT'),
  validateBody(updatePatientProfileSchema),
  userController.updatePatientProfile
);

// Doctor-specific profile endpoints (Enforced with RBAC: role must be 'DOCTOR')
userRouter.get(
  '/me/doctor-profile',
  authenticate,
  authorize('DOCTOR'),
  userController.getDoctorProfile
);
userRouter.patch(
  '/me/doctor-profile',
  authenticate,
  authorize('DOCTOR'),
  validateBody(updateDoctorProfileSchema),
  userController.updateDoctorProfile
);
