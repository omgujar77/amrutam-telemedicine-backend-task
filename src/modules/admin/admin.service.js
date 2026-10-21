import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/AppError.js';
import { auditService } from '../../common/audit/audit.service.js';
import { logger } from '../../common/logger/logger.js';

export const adminService = {
  /**
   * Privileged operation: Verifies or rejects a doctor's credentials.
   * Requires ADMIN role and verified MFA.
   */
  async verifyDoctor(adminUser, doctorId, { verificationStatus }, context = {}) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { id: doctorId },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    if (!doctorProfile) {
      throw new AppError('Doctor profile not found', 404, 'DOCTOR_NOT_FOUND');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const doc = await tx.doctorProfile.update({
        where: { id: doctorId },
        data: { verificationStatus }
      });

      await auditService.log(
        {
          actorId: adminUser.id,
          action: verificationStatus === 'VERIFIED' ? 'DOCTOR_VERIFIED' : 'DOCTOR_REJECTED',
          entityType: 'DoctorProfile',
          entityId: doctorId,
          metadata: {
            adminId: adminUser.id,
            previousStatus: doctorProfile.verificationStatus,
            newStatus: verificationStatus
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        },
        tx
      );

      return doc;
    });

    logger.info({ adminId: adminUser.id, doctorId, verificationStatus }, 'Doctor verification status updated by admin');
    return updated;
  },

  /**
   * Privileged operation: Retrieves system audit logs.
   * Requires ADMIN role and verified MFA.
   */
  async listAuditLogs(adminUser, { action, entityType, page = 1, pageSize = 20 }) {
    const pageNum = Number(page) || 1;
    const pageSizeNum = Number(pageSize) || 20;
    const skip = (pageNum - 1) * pageSizeNum;
    const take = pageSizeNum;

    const where = {
      ...(action && { action }),
      ...(entityType && { entityType })
    };

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: { id: true, name: true, email: true, role: true }
          }
        }
      })
    ]);

    return {
      data: logs,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum)
      }
    };
  },

  /**
   * Privileged operation: System security & MFA overview.
   */
  async getSecurityOverview(adminUser) {
    const [totalUsers, totalMfaEnabled, pendingDoctors, totalConsultations] = await Promise.all([
      prisma.user.count(),
      prisma.userMfa.count({ where: { isEnabled: true } }),
      prisma.doctorProfile.count({ where: { verificationStatus: 'PENDING' } }),
      prisma.consultation.count()
    ]);

    return {
      totalUsers,
      totalMfaEnabled,
      pendingDoctors,
      totalConsultations
    };
  },

  /**
   * Privileged operation: Administrative analytics overview with time-window filtering.
   * Aggregate-only calculations without exposing private patient/doctor records.
   */
  async getAnalyticsOverview(adminUser, { window = '30d', startDate, endDate } = {}) {
    let windowStart;
    let windowEnd = new Date();

    if (startDate && endDate) {
      windowStart = new Date(startDate);
      windowEnd = new Date(endDate);
    } else {
      const days = window === '7d' ? 7 : window === '90d' ? 90 : 30;
      windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    }

    const [
      totalPatients,
      totalDoctors,
      verifiedDoctors,
      pendingDoctors,
      rejectedDoctors,
      totalConsultations,
      consultationsByStatusRaw,
      consultationsCreatedInWindow,
      consultationsCompletedInWindow,
      totalPrescriptions,
      prescriptionsCreatedInWindow
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'PATIENT' } }),
      prisma.doctorProfile.count(),
      prisma.doctorProfile.count({ where: { verificationStatus: 'VERIFIED' } }),
      prisma.doctorProfile.count({ where: { verificationStatus: 'PENDING' } }),
      prisma.doctorProfile.count({ where: { verificationStatus: 'REJECTED' } }),
      prisma.consultation.count(),
      prisma.consultation.groupBy({
        by: ['status'],
        _count: { id: true }
      }),
      prisma.consultation.count({
        where: {
          createdAt: {
            gte: windowStart,
            lte: windowEnd
          }
        }
      }),
      prisma.consultation.count({
        where: {
          status: 'COMPLETED',
          completedAt: {
            gte: windowStart,
            lte: windowEnd
          }
        }
      }),
      prisma.prescription.count(),
      prisma.prescription.count({
        where: {
          createdAt: {
            gte: windowStart,
            lte: windowEnd
          }
        }
      })
    ]);

    // Build predictable map of all status counts
    const byStatus = {
      SCHEDULED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0
    };

    for (const group of consultationsByStatusRaw) {
      if (group.status in byStatus) {
        byStatus[group.status] = group._count.id;
      }
    }

    return {
      timeWindow: {
        window: startDate && endDate ? 'custom' : window,
        startDate: windowStart.toISOString(),
        endDate: windowEnd.toISOString()
      },
      users: {
        totalPatients,
        totalDoctors,
        verifiedDoctors,
        pendingDoctors,
        rejectedDoctors
      },
      consultations: {
        total: totalConsultations,
        byStatus,
        createdInWindow: consultationsCreatedInWindow,
        completedInWindow: consultationsCompletedInWindow
      },
      prescriptions: {
        total: totalPrescriptions,
        createdInWindow: prescriptionsCreatedInWindow
      }
    };
  }
};
