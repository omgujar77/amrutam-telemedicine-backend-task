import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/AppError.js';
import { logger } from '../../common/logger/logger.js';

export const availabilityService = {
  /**
   * Creates an availability slot for the authenticated doctor.
   */
  async createSlot(userId, { startTime, endTime }) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId }
    });

    if (!doctorProfile) {
      throw new AppError('A registered doctor profile is required before publishing availability slots', 400, 'DOCTOR_PROFILE_REQUIRED');
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    // 1. Exact duplicate check
    const exactDuplicate = await prisma.availabilitySlot.findFirst({
      where: {
        doctorId: doctorProfile.id,
        startTime: start,
        endTime: end
      }
    });

    if (exactDuplicate) {
      throw new AppError('An availability slot with the exact same start and end time already exists', 409, 'SLOT_DUPLICATE');
    }

    // 2. Overlap check: Overlaps occur when (start < existing.end) AND (end > existing.start)
    const overlappingSlot = await prisma.availabilitySlot.findFirst({
      where: {
        doctorId: doctorProfile.id,
        status: { in: ['AVAILABLE', 'RESERVED', 'BOOKED'] },
        AND: [
          { startTime: { lt: end } },
          { endTime: { gt: start } }
        ]
      }
    });

    if (overlappingSlot) {
      throw new AppError('The requested time range overlaps with an existing active availability slot', 409, 'SLOT_OVERLAP');
    }

    const newSlot = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctorProfile.id,
        startTime: start,
        endTime: end,
        status: 'AVAILABLE'
      }
    });

    logger.info({ doctorId: doctorProfile.id, slotId: newSlot.id }, 'Doctor availability slot created');
    return newSlot;
  },

  /**
   * Lists all availability slots for the authenticated doctor.
   */
  async listMySlots(userId, { status, date }) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId }
    });

    if (!doctorProfile) {
      throw new AppError('Doctor profile not found', 404, 'NOT_FOUND');
    }

    const where = {
      doctorId: doctorProfile.id,
      ...(status && { status })
    };

    if (date) {
      const dayStart = new Date(date);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      where.startTime = {
        gte: dayStart,
        lt: dayEnd
      };
    }

    const slots = await prisma.availabilitySlot.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        consultation: {
          select: {
            id: true,
            status: true,
            patient: {
              select: {
                id: true,
                user: { select: { id: true, name: true, email: true } }
              }
            }
          }
        }
      }
    });

    return slots;
  },

  /**
   * Deletes or removes an unbooked availability slot.
   */
  async deleteSlot(userId, slotId) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId }
    });

    if (!doctorProfile) {
      throw new AppError('Doctor profile not found', 404, 'NOT_FOUND');
    }

    const slot = await prisma.availabilitySlot.findUnique({
      where: { id: slotId }
    });

    if (!slot || slot.doctorId !== doctorProfile.id) {
      throw new AppError('Availability slot not found or not owned by you', 404, 'NOT_FOUND');
    }

    if (slot.status === 'BOOKED') {
      throw new AppError('Cannot delete an availability slot that already has a confirmed booking', 409, 'SLOT_ALREADY_BOOKED');
    }

    await prisma.availabilitySlot.delete({
      where: { id: slotId }
    });

    logger.info({ doctorId: doctorProfile.id, slotId }, 'Availability slot deleted successfully');
    return { id: slotId, deleted: true };
  }
};
