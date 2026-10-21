import crypto from 'node:crypto';
import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/AppError.js';
import { logger } from '../../common/logger/logger.js';

export const bookingService = {
  /**
   * Generates a deterministic SHA-256 fingerprint for the booking payload.
   */
  generateRequestHash(payload) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  },

  /**
   * Atomically reserves a slot and creates a consultation booking with idempotency protection.
   */
  async createBooking(userId, { slotId }, idempotencyKey) {
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new AppError('Idempotency-Key header is required for creating a booking', 400, 'IDEMPOTENCY_KEY_REQUIRED');
    }

    const trimmedKey = idempotencyKey.trim();
    if (trimmedKey.length === 0 || trimmedKey.length > 128) {
      throw new AppError('Idempotency-Key must be between 1 and 128 characters', 400, 'INVALID_IDEMPOTENCY_KEY');
    }

    const requestHash = this.generateRequestHash({ slotId });
    const operation = 'booking:create';

    // 1. Fast idempotency check before locking
    const existingRecord = await prisma.idempotencyRecord.findUnique({
      where: {
        unique_user_operation_idempotency: {
          userId,
          operation,
          idempotencyKey: trimmedKey
        }
      }
    });

    if (existingRecord) {
      if (existingRecord.requestHash !== requestHash) {
        throw new AppError(
          'Idempotency key has already been used with a different request payload',
          409,
          'IDEMPOTENCY_KEY_MISMATCH'
        );
      }

      logger.info({ userId, idempotencyKey: trimmedKey, consultationId: existingRecord.resourceId }, 'Idempotent booking replay returned');
      return {
        booking: existingRecord.responseBody,
        isReplay: true
      };
    }

    // 2. Perform transactional slot reservation and booking creation
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Ensure patient profile exists
        let patientProfile = await tx.patientProfile.findUnique({
          where: { userId }
        });

        if (!patientProfile) {
          patientProfile = await tx.patientProfile.create({
            data: { userId }
          });
        }

        // Verify slot existence
        const slot = await tx.availabilitySlot.findUnique({
          where: { id: slotId }
        });

        if (!slot) {
          throw new AppError('The requested availability slot does not exist', 404, 'SLOT_NOT_FOUND');
        }

        // Atomic conditional update: Set status to BOOKED only if currently AVAILABLE
        const updateResult = await tx.availabilitySlot.updateMany({
          where: {
            id: slotId,
            status: 'AVAILABLE'
          },
          data: {
            status: 'BOOKED'
          }
        });

        if (updateResult.count === 0) {
          throw new AppError(
            'The requested availability slot is already booked or no longer available',
            409,
            'SLOT_UNAVAILABLE'
          );
        }

        // Create consultation booking
        const consultation = await tx.consultation.create({
          data: {
            patientId: patientProfile.id,
            doctorId: slot.doctorId,
            slotId: slot.id,
            status: 'SCHEDULED',
            scheduledAt: slot.startTime
          },
          include: {
            patient: {
              select: {
                id: true,
                user: { select: { id: true, name: true, email: true } }
              }
            },
            doctor: {
              select: {
                id: true,
                specialization: true,
                consultationFee: true,
                user: { select: { id: true, name: true, email: true } }
              }
            },
            slot: {
              select: {
                id: true,
                startTime: true,
                endTime: true,
                status: true
              }
            }
          }
        });

        // Persist idempotency record within the same atomic transaction
        await tx.idempotencyRecord.create({
          data: {
            userId,
            operation,
            idempotencyKey: trimmedKey,
            requestHash,
            resourceId: consultation.id,
            responseBody: consultation,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours retention
          }
        });

        return consultation;
      });

      logger.info({ userId, consultationId: result.id, slotId }, 'Consultation booking created successfully');
      return {
        booking: result,
        isReplay: false
      };
    } catch (error) {
      // Handle race condition where another concurrent request with the same idempotency key succeeded
      if (error.code === 'P2002' && error.meta?.target?.includes('idempotency_key')) {
        const raceRecord = await prisma.idempotencyRecord.findUnique({
          where: {
            unique_user_operation_idempotency: {
              userId,
              operation,
              idempotencyKey: trimmedKey
            }
          }
        });

        if (raceRecord) {
          if (raceRecord.requestHash === requestHash) {
            return {
              booking: raceRecord.responseBody,
              isReplay: true
            };
          }
          throw new AppError('Idempotency key conflict', 409, 'IDEMPOTENCY_KEY_MISMATCH');
        }
      }

      // Handle race condition where slot unique constraint was triggered
      if (error.code === 'P2002' && error.meta?.target?.includes('slot_id')) {
        throw new AppError(
          'The requested availability slot is already booked',
          409,
          'SLOT_UNAVAILABLE'
        );
      }

      throw error;
    }
  },

  /**
   * Retrieves bookings for the authenticated patient.
   */
  async getPatientBookings(userId, { status, page = 1, pageSize = 10 }) {
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId }
    });

    if (!patientProfile) {
      return {
        data: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 }
      };
    }

    const where = {
      patientId: patientProfile.id,
      ...(status && { status })
    };

    const pageNum = Number(page) || 1;
    const pageSizeNum = Number(pageSize) || 10;
    const skip = (pageNum - 1) * pageSizeNum;
    const take = pageSizeNum;

    const [total, bookings] = await Promise.all([
      prisma.consultation.count({ where }),
      prisma.consultation.findMany({
        where,
        skip,
        take,
        orderBy: { scheduledAt: 'desc' },
        include: {
          doctor: {
            select: {
              id: true,
              specialization: true,
              consultationFee: true,
              user: { select: { id: true, name: true, email: true } }
            }
          },
          slot: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              status: true
            }
          }
        }
      })
    ]);

    return {
      data: bookings,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum)
      }
    };
  },

  /**
   * Retrieves bookings assigned to the authenticated doctor.
   */
  async getDoctorBookings(userId, { status, page = 1, pageSize = 10 }) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId }
    });

    if (!doctorProfile) {
      throw new AppError('Doctor profile not found', 404, 'DOCTOR_NOT_FOUND');
    }

    const where = {
      doctorId: doctorProfile.id,
      ...(status && { status })
    };

    const pageNum = Number(page) || 1;
    const pageSizeNum = Number(pageSize) || 10;
    const skip = (pageNum - 1) * pageSizeNum;
    const take = pageSizeNum;

    const [total, bookings] = await Promise.all([
      prisma.consultation.count({ where }),
      prisma.consultation.findMany({
        where,
        skip,
        take,
        orderBy: { scheduledAt: 'desc' },
        include: {
          patient: {
            select: {
              id: true,
              user: { select: { id: true, name: true, email: true } }
            }
          },
          slot: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              status: true
            }
          }
        }
      })
    ]);

    return {
      data: bookings,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum)
      }
    };
  },

  /**
   * Cancels a scheduled booking and releases the slot.
   */
  async cancelBooking(userId, bookingId, cancellationReason) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { patientProfile: true, doctorProfile: true }
    });

    const booking = await prisma.consultation.findUnique({
      where: { id: bookingId }
    });

    if (!booking) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    // Ownership check: must be the patient or the doctor
    const isPatient = user?.patientProfile && booking.patientId === user.patientProfile.id;
    const isDoctor = user?.doctorProfile && booking.doctorId === user.doctorProfile.id;

    if (!isPatient && !isDoctor && user?.role !== 'ADMIN') {
      throw new AppError('You do not have permission to cancel this booking', 403, 'FORBIDDEN');
    }

    if (booking.status !== 'SCHEDULED') {
      throw new AppError(`Cannot cancel a booking that is already ${booking.status}`, 400, 'INVALID_BOOKING_STATUS');
    }

    // Transactionally cancel booking and release slot
    const cancelledBooking = await prisma.$transaction(async (tx) => {
      await tx.availabilitySlot.update({
        where: { id: booking.slotId },
        data: { status: 'AVAILABLE' }
      });

      return tx.consultation.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          cancellationReason: cancellationReason || 'Cancelled by user'
        }
      });
    });

    logger.info({ bookingId, cancelledBy: userId }, 'Booking cancelled and slot released');
    return cancelledBooking;
  }
};
