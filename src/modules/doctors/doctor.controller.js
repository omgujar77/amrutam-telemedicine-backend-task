import { doctorService } from './doctor.service.js';
import { availabilityService } from '../availability/availability.service.js';
import { bookingService } from '../bookings/booking.service.js';

export const doctorController = {
  /**
   * Public: Searches doctors with filters and pagination.
   */
  async searchDoctors(req, res, next) {
    try {
      const result = await doctorService.searchDoctors(req.query);
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
   * Public: Retrieves bookable availability slots for a doctor.
   */
  async getDoctorAvailability(req, res, next) {
    try {
      const result = await doctorService.getDoctorAvailability(req.params.doctorId, req.query);
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
   * Doctor-only: Creates an availability slot for the authenticated doctor.
   */
  async createAvailabilitySlot(req, res, next) {
    try {
      const slot = await availabilityService.createSlot(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'Availability slot created successfully',
        data: slot
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Doctor-only: Lists all availability slots for the authenticated doctor.
   */
  async listMyAvailability(req, res, next) {
    try {
      const slots = await availabilityService.listMySlots(req.user.id, req.query);
      res.status(200).json({
        success: true,
        data: slots
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Doctor-only: Deletes an unbooked availability slot.
   */
  async deleteAvailabilitySlot(req, res, next) {
    try {
      const result = await availabilityService.deleteSlot(req.user.id, req.params.slotId);
      res.status(200).json({
        success: true,
        message: 'Availability slot deleted successfully',
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Doctor-only: Retrieves bookings assigned to the authenticated doctor.
   */
  async getMyBookings(req, res, next) {
    try {
      const result = await bookingService.getDoctorBookings(req.user.id, req.query);
      res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }
};
