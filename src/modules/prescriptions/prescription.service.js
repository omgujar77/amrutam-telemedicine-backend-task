import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/AppError.js';
import { auditService } from '../../common/audit/audit.service.js';
import { logger } from '../../common/logger/logger.js';

export const prescriptionService = {
  /**
   * Creates a prescription for an active or completed consultation (Assigned Doctor only).
   */
  async createPrescription(userId, consultationId, data, context = {}) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId }
    });

    if (!doctorProfile) {
      throw new AppError('Only registered doctors can create prescriptions', 403, 'FORBIDDEN');
    }

    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { doctor: true, patient: true }
    });

    if (!consultation) {
      throw new AppError('Consultation not found', 404, 'CONSULTATION_NOT_FOUND');
    }

    // Authorization: only the assigned doctor can issue prescriptions
    if (consultation.doctorId !== doctorProfile.id) {
      throw new AppError('You are not the assigned doctor for this consultation', 403, 'FORBIDDEN');
    }

    // State check: prescribing is permitted during IN_PROGRESS or COMPLETED
    if (consultation.status === 'SCHEDULED') {
      throw new AppError(
        'Cannot prescribe medication before the consultation has started',
        409,
        'INVALID_CONSULTATION_STATE'
      );
    }

    if (consultation.status === 'CANCELLED') {
      throw new AppError(
        'Cannot prescribe medication for a cancelled consultation',
        409,
        'INVALID_CONSULTATION_STATE'
      );
    }

    // Create prescription and record audit entry atomically in a transaction
    const prescription = await prisma.$transaction(async (tx) => {
      const createdPrescription = await tx.prescription.create({
        data: {
          consultationId,
          prescribingDoctorId: doctorProfile.id,
          medicines: data.medicines,
          dosageInstructions: data.dosageInstructions.trim(),
          advice: data.advice ? data.advice.trim() : null
        },
        include: {
          prescribingDoctor: {
            select: {
              id: true,
              specialization: true,
              user: { select: { id: true, name: true, email: true } }
            }
          },
          consultation: {
            select: {
              id: true,
              status: true,
              scheduledAt: true,
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

      await auditService.log(
        {
          actorId: userId,
          action: 'PRESCRIPTION_CREATED',
          entityType: 'Prescription',
          entityId: createdPrescription.id,
          metadata: {
            consultationId,
            doctorId: doctorProfile.id,
            patientId: consultation.patientId,
            itemCount: data.medicines.length
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        },
        tx
      );

      return createdPrescription;
    });

    logger.info({ prescriptionId: prescription.id, consultationId }, 'Prescription created successfully');
    return prescription;
  },

  /**
   * Retrieves all prescriptions associated with a consultation.
   * Access permitted to patient, assigned doctor, and administrator.
   */
  async getPrescriptionsByConsultation(user, consultationId) {
    const consultation = await prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        patient: true,
        doctor: true
      }
    });

    if (!consultation) {
      throw new AppError('Consultation not found', 404, 'CONSULTATION_NOT_FOUND');
    }

    const isPatient = consultation.patient?.userId === user.id;
    const isDoctor = consultation.doctor?.userId === user.id;
    const isAdmin = user.role === 'ADMIN';

    if (!isPatient && !isDoctor && !isAdmin) {
      throw new AppError('You do not have permission to view prescriptions for this consultation', 403, 'FORBIDDEN');
    }

    const prescriptions = await prisma.prescription.findMany({
      where: { consultationId },
      orderBy: { createdAt: 'desc' },
      include: {
        prescribingDoctor: {
          select: {
            id: true,
            specialization: true,
            user: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });

    return prescriptions;
  },

  /**
   * Retrieves a specific prescription by ID.
   * Access permitted to associated patient, assigned doctor, and administrator.
   */
  async getPrescriptionById(user, prescriptionId) {
    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        prescribingDoctor: {
          select: {
            id: true,
            specialization: true,
            user: { select: { id: true, name: true, email: true } }
          }
        },
        consultation: {
          include: {
            patient: true,
            doctor: true
          }
        }
      }
    });

    if (!prescription) {
      throw new AppError('Prescription not found', 404, 'PRESCRIPTION_NOT_FOUND');
    }

    const isPatient = prescription.consultation?.patient?.userId === user.id;
    const isDoctor = prescription.consultation?.doctor?.userId === user.id;
    const isAdmin = user.role === 'ADMIN';

    if (!isPatient && !isDoctor && !isAdmin) {
      throw new AppError('You do not have permission to view this prescription', 403, 'FORBIDDEN');
    }

    return prescription;
  },

  /**
   * Retrieves paginated prescriptions belonging to the authenticated patient or doctor.
   */
  async getMyPrescriptions(user, { page = 1, pageSize = 10 } = {}) {
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSizeNum = Math.min(50, Math.max(1, Number(pageSize) || 10));
    const skip = (pageNum - 1) * pageSizeNum;
    const take = pageSizeNum;

    let where = {};
    if (user.role === 'PATIENT') {
      where = {
        consultation: {
          patient: { userId: user.id }
        }
      };
    } else if (user.role === 'DOCTOR') {
      where = {
        prescribingDoctor: { userId: user.id }
      };
    } else if (user.role === 'ADMIN') {
      where = {};
    } else {
      throw new AppError('Unauthorized role', 403, 'FORBIDDEN');
    }

    const [total, prescriptions] = await Promise.all([
      prisma.prescription.count({ where }),
      prisma.prescription.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: {
          prescribingDoctor: {
            select: {
              id: true,
              specialization: true,
              user: { select: { id: true, name: true, email: true } }
            }
          },
          consultation: {
            select: {
              id: true,
              status: true,
              scheduledAt: true,
              patient: {
                select: {
                  id: true,
                  user: { select: { id: true, name: true, email: true } }
                }
              }
            }
          }
        }
      })
    ]);

    return {
      data: prescriptions,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum)
      }
    };
  }
};
