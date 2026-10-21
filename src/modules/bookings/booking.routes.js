import { Router } from 'express';
import { bookingController } from './booking.controller.js';
import { createBookingSchema, listBookingsQuerySchema, cancelBookingSchema } from './booking.validation.js';
import { validateBody, validateQuery } from '../../common/middleware/validate.js';
import { authenticate, authorize } from '../auth/auth.middleware.js';

export const bookingRouter = Router();

// Create a new booking (Patient-only, requires Idempotency-Key header)
bookingRouter.post(
  '/',
  authenticate,
  authorize('PATIENT'),
  validateBody(createBookingSchema),
  bookingController.createBooking
);

// View patient's own bookings (Patient-only)
bookingRouter.get(
  '/me',
  authenticate,
  authorize('PATIENT'),
  validateQuery(listBookingsQuerySchema),
  bookingController.getMyBookings
);

// Cancel a scheduled booking (Patient or Doctor owner)
bookingRouter.post(
  '/:bookingId/cancel',
  authenticate,
  validateBody(cancelBookingSchema),
  bookingController.cancelBooking
);
