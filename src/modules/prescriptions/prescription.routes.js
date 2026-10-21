import { Router } from 'express';
import { prescriptionController } from './prescription.controller.js';
import { authenticate } from '../auth/auth.middleware.js';
import { validateQuery } from '../../common/middleware/validate.js';
import { listPrescriptionsQuerySchema } from './prescription.validation.js';

export const prescriptionRouter = Router();

// Retrieve authenticated user's prescriptions (/me)
// Must be defined before parameterized /:prescriptionId routes
prescriptionRouter.get(
  '/me',
  authenticate,
  validateQuery(listPrescriptionsQuerySchema),
  prescriptionController.getMyPrescriptions
);

// Retrieve a prescription by ID (Associated patient, assigned doctor, or admin)
prescriptionRouter.get(
  '/:prescriptionId',
  authenticate,
  prescriptionController.getPrescriptionById
);
