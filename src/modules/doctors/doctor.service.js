import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/AppError.js';

export const doctorService = {
  /**
   * Searches doctors with filters and bounded pagination.
   */
  async searchDoctors(query = {}) {
    const {
      search,
      name,
      q,
      specialization,
      verificationStatus,
      availableDate,
      maxFee,
      minExperience,
      page = 1,
      pageSize = 10
    } = query;

    const pageNum = Math.max(1, Number(page) || 1);
    const pageSizeNum = Math.min(50, Math.max(1, Number(pageSize) || 10));
    const skip = (pageNum - 1) * pageSizeNum;
    const take = pageSizeNum;

    const searchTerm = (search || name || q || '').trim();

    const where = {
      user: {
        status: 'ACTIVE'
      },
      ...(verificationStatus && { verificationStatus }),
      ...(specialization && {
        specialization: {
          contains: specialization,
          mode: 'insensitive'
        }
      }),
      ...(maxFee !== undefined && maxFee !== null && {
        consultationFee: {
          lte: Number(maxFee)
        }
      }),
      ...(minExperience !== undefined && minExperience !== null && {
        experienceYears: {
          gte: Number(minExperience)
        }
      }),
      ...(availableDate && {
        availabilitySlots: {
          some: {
            status: 'AVAILABLE',
            startTime: {
              gte: new Date(`${availableDate}T00:00:00.000Z`),
              lte: new Date(`${availableDate}T23:59:59.999Z`)
            }
          }
        }
      }),
      ...(searchTerm && {
        OR: [
          {
            user: {
              name: {
                contains: searchTerm,
                mode: 'insensitive'
              }
            }
          },
          {
            specialization: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          },
          {
            qualifications: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          }
        ]
      })
    };

    const [total, doctors] = await Promise.all([
      prisma.doctorProfile.count({ where }),
      prisma.doctorProfile.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          userId: true,
          qualifications: true,
          specialization: true,
          experienceYears: true,
          bio: true,
          consultationFee: true,
          verificationStatus: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      })
    ]);

    return {
      data: doctors,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum)
      }
    };
  },

  /**
   * Retrieves public bookable availability slots for a specific doctor.
   * Only returns future slots with status 'AVAILABLE'.
   */
  async getDoctorAvailability(doctorId, { date, page = 1, pageSize = 20 }) {
    const doctor = await prisma.doctorProfile.findUnique({
      where: { id: doctorId }
    });

    if (!doctor) {
      throw new AppError('Doctor not found', 404, 'DOCTOR_NOT_FOUND');
    }

    const now = new Date();
    const where = {
      doctorId,
      status: 'AVAILABLE',
      startTime: {
        gt: now
      }
    };

    if (date) {
      const dayStart = new Date(date);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      where.startTime = {
        gte: dayStart > now ? dayStart : now,
        lt: dayEnd
      };
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const pageSizeNum = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const skip = (pageNum - 1) * pageSizeNum;
    const take = pageSizeNum;

    const [total, slots] = await Promise.all([
      prisma.availabilitySlot.count({ where }),
      prisma.availabilitySlot.findMany({
        where,
        skip,
        take,
        orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          doctorId: true,
          startTime: true,
          endTime: true,
          status: true
        }
      })
    ]);

    return {
      data: slots,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum)
      }
    };
  }
};
