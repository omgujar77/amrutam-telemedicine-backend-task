import { Router } from 'express';
import { doctorController } from './doctor.controller.js';
import { searchDoctorsQuerySchema, getDoctorAvailabilityQuerySchema } from './doctor.validation.js';
import { createSlotSchema, listMySlotsQuerySchema } from '../availability/availability.validation.js';
import { listBookingsQuerySchema } from '../bookings/booking.validation.js';
import { validateBody, validateQuery } from '../../common/middleware/validate.js';
import { authenticate, authorize } from '../auth/auth.middleware.js';

export const doctorRouter = Router();

// ==========================================
// Authenticated Doctor-only routes (/me/...)
// (Must be defined before parameterized /:doctorId routes)
// ==========================================

// Create an availability slot for the authenticated doctor
doctorRouter.post(
  '/me/availability',
  authenticate,
  authorize('DOCTOR'),
  validateBody(createSlotSchema),
  doctorController.createAvailabilitySlot
);

// List availability slots for the authenticated doctor
doctorRouter.get(
  '/me/availability',
  authenticate,
  authorize('DOCTOR'),
  validateQuery(listMySlotsQuerySchema),
  doctorController.listMyAvailability
);

// Delete an unbooked availability slot
doctorRouter.delete(
  '/me/availability/:slotId',
  authenticate,
  authorize('DOCTOR'),
  doctorController.deleteAvailabilitySlot
);

// View bookings assigned to the authenticated doctor
doctorRouter.get(
  '/me/bookings',
  authenticate,
  authorize('DOCTOR'),
  validateQuery(listBookingsQuerySchema),
  doctorController.getMyBookings
);

// ==========================================
// Public Doctor routes
// ==========================================

// Search doctors with filters and pagination
doctorRouter.get(
  '/',
  validateQuery(searchDoctorsQuerySchema),
  doctorController.searchDoctors
);

// Get bookable availability slots for a specific doctor
doctorRouter.get(
  '/:doctorId/availability',
  validateQuery(getDoctorAvailabilityQuerySchema),
  doctorController.getDoctorAvailability
);
