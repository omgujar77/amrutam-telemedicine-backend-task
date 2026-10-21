import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/AppError.js';
import { auditService } from '../../common/audit/audit.service.js';
import { logger } from '../../common/logger/logger.js';

export const consultationService = {
  /**
   * Starts a scheduled consultation (Assigned Doctor only).
   * Enforces lifecycle transition: SCHEDULED -> IN_PROGRESS.
   */
  async startConsultation(userId, consultationId, context = {}) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId }
    });

    if (!doctorProfile) {
      throw new AppError('Only registered doctors can start consultations', 403, 'FORBIDDEN');
    }

    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId }
    });

    if (!consultation) {
      throw new AppError('Consultation not found', 404, 'CONSULTATION_NOT_FOUND');
    }

    // Authorization: only the assigned doctor can start it
    if (consultation.doctorId !== doctorProfile.id) {
      throw new AppError('You are not the assigned doctor for this consultation', 403, 'FORBIDDEN');
    }

    // Lifecycle validation
    if (consultation.status === 'IN_PROGRESS') {
      throw new AppError('Consultation has already started', 409, 'INVALID_STATUS_TRANSITION');
    }

    if (consultation.status === 'COMPLETED') {
      throw new AppError('Cannot start a consultation that is already completed', 409, 'INVALID_STATUS_TRANSITION');
    }

    if (consultation.status === 'CANCELLED') {
      throw new AppError('Cannot start a cancelled consultation', 409, 'INVALID_STATUS_TRANSITION');
    }

    if (consultation.status !== 'SCHEDULED') {
      throw new AppError(`Cannot start consultation from status ${consultation.status}`, 409, 'INVALID_STATUS_TRANSITION');
    }

    // Atomic conditional transition inside transaction to prevent race conditions
    const updatedConsultation = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.consultation.updateMany({
        where: {
          id: consultationId,
          doctorId: doctorProfile.id,
          status: 'SCHEDULED'
        },
        data: {
          status: 'IN_PROGRESS',
          startedAt: new Date()
        }
      });

      if (updateResult.count === 0) {
        throw new AppError(
          'Consultation cannot be started; state was modified concurrently',
          409,
          'INVALID_STATUS_TRANSITION'
        );
      }

      await auditService.log(
        {
          actorId: userId,
          action: 'CONSULTATION_STARTED',
          entityType: 'Consultation',
          entityId: consultationId,
          metadata: {
            doctorId: doctorProfile.id,
            patientId: consultation.patientId,
            startedAt: new Date()
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        },
        tx
      );

      return tx.consultation.findUnique({
        where: { id: consultationId },
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
    });

    logger.info({ consultationId, doctorId: doctorProfile.id }, 'Consultation started');
    return updatedConsultation;
  },

  /**
   * Completes an in-progress consultation (Assigned Doctor only).
   * Enforces lifecycle transition: IN_PROGRESS -> COMPLETED.
   */
  async completeConsultation(userId, consultationId, { notes } = {}, context = {}) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId }
    });

    if (!doctorProfile) {
      throw new AppError('Only registered doctors can complete consultations', 403, 'FORBIDDEN');
    }

    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId }
    });

    if (!consultation) {
      throw new AppError('Consultation not found', 404, 'CONSULTATION_NOT_FOUND');
    }

    // Authorization: only the assigned doctor can complete it
    if (consultation.doctorId !== doctorProfile.id) {
      throw new AppError('You are not the assigned doctor for this consultation', 403, 'FORBIDDEN');
    }

    // Lifecycle validation
    if (consultation.status === 'SCHEDULED') {
      throw new AppError('Consultation cannot be completed before it has started', 409, 'INVALID_STATUS_TRANSITION');
    }

    if (consultation.status === 'COMPLETED') {
      throw new AppError('Consultation is already completed', 409, 'INVALID_STATUS_TRANSITION');
    }

    if (consultation.status === 'CANCELLED') {
      throw new AppError('Cannot complete a cancelled consultation', 409, 'INVALID_STATUS_TRANSITION');
    }

    if (consultation.status !== 'IN_PROGRESS') {
      throw new AppError(`Cannot complete consultation from status ${consultation.status}`, 409, 'INVALID_STATUS_TRANSITION');
    }

    // Atomic conditional transition inside transaction
    const completedConsultation = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.consultation.updateMany({
        where: {
          id: consultationId,
          doctorId: doctorProfile.id,
          status: 'IN_PROGRESS'
        },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          ...(notes !== undefined && { notes: notes.trim() })
        }
      });

      if (updateResult.count === 0) {
        throw new AppError(
          'Consultation cannot be completed; state was modified concurrently',
          409,
          'INVALID_STATUS_TRANSITION'
        );
      }

      await auditService.log(
        {
          actorId: userId,
          action: 'CONSULTATION_COMPLETED',
          entityType: 'Consultation',
          entityId: consultationId,
          metadata: {
            doctorId: doctorProfile.id,
            patientId: consultation.patientId,
            completedAt: new Date()
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        },
        tx
      );

      return tx.consultation.findUnique({
        where: { id: consultationId },
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
          },
          prescriptions: true
        }
      });
    });

    logger.info({ consultationId, doctorId: doctorProfile.id }, 'Consultation completed');
    return completedConsultation;
  },

  /**
   * Retrieves consultations belonging to the authenticated patient or doctor.
   * Scoped via authenticated identity with bounded pagination.
   */
  async getMyConsultations(user, { status, page = 1, pageSize = 10 }) {
    const pageNum = Number(page) || 1;
    const pageSizeNum = Number(pageSize) || 10;
    const skip = (pageNum - 1) * pageSizeNum;
    const take = pageSizeNum;

    let where = {};

    if (user.role === 'PATIENT') {
      const patientProfile = await prisma.patientProfile.findUnique({
        where: { userId: user.id }
      });

      if (!patientProfile) {
        return {
          data: [],
          pagination: { page: pageNum, pageSize: pageSizeNum, total: 0, totalPages: 0 }
        };
      }

      where.patientId = patientProfile.id;
    } else if (user.role === 'DOCTOR') {
      const doctorProfile = await prisma.doctorProfile.findUnique({
        where: { userId: user.id }
      });

      if (!doctorProfile) {
        return {
          data: [],
          pagination: { page: pageNum, pageSize: pageSizeNum, total: 0, totalPages: 0 }
        };
      }

      where.doctorId = doctorProfile.id;
    } else if (user.role === 'ADMIN') {
      // Admins can see all consultations
    } else {
      throw new AppError('Unauthorized role', 403, 'FORBIDDEN');
    }

    if (status) {
      where.status = status;
    }

    const [total, consultations] = await Promise.all([
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
          },
          prescriptions: {
            select: {
              id: true,
              createdAt: true
            }
          }
        }
      })
    ]);

    return {
      data: consultations,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum)
      }
    };
  },

  /**
   * Retrieves a single consultation by ID.
   * Access restricted to associated patient, assigned doctor, or administrator.
   */
  async getConsultationById(user, consultationId) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        patient: {
          select: {
            id: true,
            userId: true,
            user: { select: { id: true, name: true, email: true } }
          }
        },
        doctor: {
          select: {
            id: true,
            userId: true,
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
        },
        prescriptions: true
      }
    });

    if (!consultation) {
      throw new AppError('Consultation not found', 404, 'CONSULTATION_NOT_FOUND');
    }

    const isPatient = consultation.patient?.userId === user.id;
    const isDoctor = consultation.doctor?.userId === user.id;
    const isAdmin = user.role === 'ADMIN';

    if (!isPatient && !isDoctor && !isAdmin) {
      throw new AppError('You do not have permission to view this consultation', 403, 'FORBIDDEN');
    }

    return consultation;
  }
};
