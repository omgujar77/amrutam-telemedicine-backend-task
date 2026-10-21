import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/AppError.js';
import { sanitizeUser } from '../auth/auth.service.js';

export const userService = {
  /**
   * Retrieves the current authenticated user's safe profile.
   */
  async getMe(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        patientProfile: true,
        doctorProfile: true
      }
    });

    if (!user) {
      throw new AppError('User profile not found', 404, 'NOT_FOUND');
    }

    return sanitizeUser(user);
  },

  /**
   * Updates basic permitted account fields (e.g. name).
   */
  async updateMe(userId, { name }) {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name: name.trim() })
      },
      include: {
        patientProfile: true,
        doctorProfile: true
      }
    });

    return sanitizeUser(updatedUser);
  },

  /**
   * Retrieves patient profile for the authenticated patient.
   */
  async getPatientProfile(userId) {
    const profile = await prisma.patientProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      throw new AppError('Patient profile not found', 404, 'NOT_FOUND');
    }

    return profile;
  },

  /**
   * Updates patient profile for the authenticated patient.
   */
  async updatePatientProfile(userId, data) {
    const profile = await prisma.patientProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      throw new AppError('Patient profile not found', 404, 'NOT_FOUND');
    }

    const updatedProfile = await prisma.patientProfile.update({
      where: { userId },
      data: {
        ...(data.dateOfBirth && { dateOfBirth: new Date(data.dateOfBirth) }),
        ...(data.gender !== undefined && { gender: data.gender }),
        ...(data.phoneNumber !== undefined && { phoneNumber: data.phoneNumber }),
        ...(data.emergencyContact !== undefined && { emergencyContact: data.emergencyContact }),
        ...(data.bloodGroup !== undefined && { bloodGroup: data.bloodGroup }),
        ...(data.allergies !== undefined && { allergies: data.allergies })
      }
    });

    return updatedProfile;
  },

  /**
   * Retrieves doctor profile for the authenticated doctor.
   */
  async getDoctorProfile(userId) {
    const profile = await prisma.doctorProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      throw new AppError('Doctor profile not found', 404, 'NOT_FOUND');
    }

    return profile;
  },

  /**
   * Updates doctor profile for the authenticated doctor.
   */
  async updateDoctorProfile(userId, data) {
    const profile = await prisma.doctorProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      throw new AppError('Doctor profile not found', 404, 'NOT_FOUND');
    }

    const updatedProfile = await prisma.doctorProfile.update({
      where: { userId },
      data: {
        ...(data.qualifications !== undefined && { qualifications: data.qualifications }),
        ...(data.specialization !== undefined && { specialization: data.specialization }),
        ...(data.experienceYears !== undefined && { experienceYears: data.experienceYears }),
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(data.consultationFee !== undefined && { consultationFee: data.consultationFee })
      }
    });

    return updatedProfile;
  }
};
