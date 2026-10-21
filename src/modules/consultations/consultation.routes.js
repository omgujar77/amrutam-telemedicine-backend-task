import { Router } from 'express';
import { consultationController } from './consultation.controller.js';
import { prescriptionController } from '../prescriptions/prescription.controller.js';
import { listConsultationsQuerySchema, completeConsultationSchema } from './consultation.validation.js';
import { createPrescriptionSchema } from '../prescriptions/prescription.validation.js';
import { validateBody, validateQuery } from '../../common/middleware/validate.js';
import { authenticate, authorize } from '../auth/auth.middleware.js';

export const consultationRouter = Router();

// ==========================================
// Authenticated user consultations (/me)
// Must be defined before parameterized /:consultationId routes
// ==========================================
consultationRouter.get(
  '/me',
  authenticate,
  validateQuery(listConsultationsQuerySchema),
  consultationController.getMyConsultations
);

// ==========================================
// Consultation Lifecycle endpoints (Assigned Doctor only)
// ==========================================
consultationRouter.post(
  '/:consultationId/start',
  authenticate,
  authorize('DOCTOR'),
  consultationController.startConsultation
);

consultationRouter.post(
  '/:consultationId/complete',
  authenticate,
  authorize('DOCTOR'),
  validateBody(completeConsultationSchema),
  consultationController.completeConsultation
);

// ==========================================
// Consultation Prescriptions endpoints
// ==========================================
consultationRouter.post(
  '/:consultationId/prescriptions',
  authenticate,
  authorize('DOCTOR'),
  validateBody(createPrescriptionSchema),
  prescriptionController.createPrescription
);

consultationRouter.get(
  '/:consultationId/prescriptions',
  authenticate,
  prescriptionController.getPrescriptionsByConsultation
);

// ==========================================
// Consultation Details by ID
// ==========================================
consultationRouter.get(
  '/:consultationId',
  authenticate,
  consultationController.getConsultationById
);
