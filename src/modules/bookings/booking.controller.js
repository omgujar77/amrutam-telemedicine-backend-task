import { bookingService } from './booking.service.js';

export const bookingController = {
  /**
   * Patient-only: Atomically books an available slot with idempotency protection.
   */
  async createBooking(req, res, next) {
    try {
      const idempotencyKey = req.headers['idempotency-key'];
      const result = await bookingService.createBooking(req.user.id, req.body, idempotencyKey);

      if (result.isReplay) {
        return res.status(200).json({
          success: true,
          message: 'Booking retrieved via idempotency replay',
          isReplay: true,
          data: result.booking
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Booking confirmed successfully',
        isReplay: false,
        data: result.booking
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Patient-only: Retrieves bookings belonging to the authenticated patient.
   */
  async getMyBookings(req, res, next) {
    try {
      const result = await bookingService.getPatientBookings(req.user.id, req.query);
      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Patient or Doctor: Cancels a scheduled booking and releases the slot.
   */
  async cancelBooking(req, res, next) {
    try {
      const result = await bookingService.cancelBooking(
        req.user.id,
        req.params.bookingId,
        req.body?.cancellationReason
      );

      res.status(200).json({
        success: true,
        message: 'Booking cancelled successfully',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
};
