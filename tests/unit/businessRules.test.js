import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { consultationService } from '../../src/modules/consultations/consultation.service.js';
import { createSlotSchema } from '../../src/modules/availability/availability.validation.js';
import { listDoctorsQuerySchema } from '../../src/modules/doctors/doctor.validation.js';
import { AppError } from '../../src/common/errors/AppError.js';

vi.spyOn(prisma.doctorProfile, 'findUnique');
vi.spyOn(prisma.consultation, 'findUnique');
vi.spyOn(prisma, '$transaction');

describe('Business Rules & Lifecycle Transition Matrix (Phase 9 / Section 3)', () => {
  const assignedDoctorUserId = 'assigned-doc-user-1';
  const assignedDoctorProfile = { id: 'doc-profile-1', userId: assignedDoctorUserId };

  const otherDoctorUserId = 'unrelated-doc-user-2';
  const otherDoctorProfile = { id: 'doc-profile-2', userId: otherDoctorUserId };

  const patientUserId = 'patient-user-1';
  const consultationId = 'consultation-test-101';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Consultation Lifecycle State Machine', () => {
    it('rejects starting a consultation that is already IN_PROGRESS (HTTP 409)', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(assignedDoctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: consultationId,
        doctorId: assignedDoctorProfile.id,
        patientId: 'patient-p-1',
        status: 'IN_PROGRESS'
      });

      await expect(
        consultationService.startConsultation(assignedDoctorUserId, consultationId)
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: expect.stringContaining('already started')
      });
    });

    it('rejects starting a consultation that is already COMPLETED (HTTP 409)', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(assignedDoctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: consultationId,
        doctorId: assignedDoctorProfile.id,
        patientId: 'patient-p-1',
        status: 'COMPLETED'
      });

      await expect(
        consultationService.startConsultation(assignedDoctorUserId, consultationId)
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: expect.stringContaining('already completed')
      });
    });

    it('rejects starting a consultation that is CANCELLED (HTTP 409)', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(assignedDoctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: consultationId,
        doctorId: assignedDoctorProfile.id,
        patientId: 'patient-p-1',
        status: 'CANCELLED'
      });

      await expect(
        consultationService.startConsultation(assignedDoctorUserId, consultationId)
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: expect.stringContaining('cancelled')
      });
    });

    it('rejects completing a consultation directly from SCHEDULED without starting it (HTTP 409)', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(assignedDoctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: consultationId,
        doctorId: assignedDoctorProfile.id,
        patientId: 'patient-p-1',
        status: 'SCHEDULED'
      });

      await expect(
        consultationService.completeConsultation(assignedDoctorUserId, consultationId, { notes: 'Summary' })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: expect.stringContaining('before it has started')
      });
    });

    it('rejects completing a consultation that is already COMPLETED (HTTP 409)', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(assignedDoctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: consultationId,
        doctorId: assignedDoctorProfile.id,
        patientId: 'patient-p-1',
        status: 'COMPLETED'
      });

      await expect(
        consultationService.completeConsultation(assignedDoctorUserId, consultationId, { notes: 'Summary' })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: expect.stringContaining('already completed')
      });
    });

    it('rejects completing a consultation that is CANCELLED (HTTP 409)', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(assignedDoctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: consultationId,
        doctorId: assignedDoctorProfile.id,
        patientId: 'patient-p-1',
        status: 'CANCELLED'
      });

      await expect(
        consultationService.completeConsultation(assignedDoctorUserId, consultationId, { notes: 'Summary' })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: expect.stringContaining('cancelled')
      });
    });
  });

  describe('Role-Based Authorization Boundaries', () => {
    it('denies non-doctor (patient) from attempting to start a consultation (HTTP 403)', async () => {
      // Patient has no DoctorProfile
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(null);

      await expect(
        consultationService.startConsultation(patientUserId, consultationId)
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN'
      });
    });

    it('denies an unassigned doctor from starting someone else’s consultation (HTTP 403)', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(otherDoctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: consultationId,
        doctorId: assignedDoctorProfile.id, // belongs to assigned doctor
        patientId: 'patient-p-1',
        status: 'SCHEDULED'
      });

      await expect(
        consultationService.startConsultation(otherDoctorUserId, consultationId)
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: expect.stringContaining('not the assigned doctor')
      });
    });

    it('denies an unassigned doctor from completing someone else’s consultation (HTTP 403)', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(otherDoctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: consultationId,
        doctorId: assignedDoctorProfile.id,
        patientId: 'patient-p-1',
        status: 'IN_PROGRESS'
      });

      await expect(
        consultationService.completeConsultation(otherDoctorUserId, consultationId, { notes: 'Done' })
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: expect.stringContaining('not the assigned doctor')
      });
    });
  });

  describe('Availability Slot Business Rules & Validation', () => {
    it('rejects slot creation where endTime is before or equal to startTime', () => {
      const invalidSlot = {
        startTime: '2026-11-15T10:00:00.000Z',
        endTime: '2026-11-15T09:30:00.000Z' // Earlier than startTime
      };

      const result = createSlotSchema.safeParse(invalidSlot);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('endTime must be strictly later than startTime');
    });

    it('accepts valid future slot times', () => {
      const validSlot = {
        startTime: '2026-11-15T10:00:00.000Z',
        endTime: '2026-11-15T10:30:00.000Z'
      };

      const result = createSlotSchema.safeParse(validSlot);
      expect(result.success).toBe(true);
    });
  });

  describe('Doctor Search Query Validation & Pagination Bounds', () => {
    it('caps or rejects pageSize exceeding configured maximum limit (50)', () => {
      const result = listDoctorsQuerySchema.safeParse({
        page: 1,
        pageSize: 100 // Exceeds max 50
      });

      expect(result.success).toBe(false);
    });

    it('rejects negative filter values for minExperience or maxFee', () => {
      const negativeExp = listDoctorsQuerySchema.safeParse({ minExperience: -5 });
      expect(negativeExp.success).toBe(false);

      const negativeFee = listDoctorsQuerySchema.safeParse({ maxFee: -100 });
      expect(negativeFee.success).toBe(false);
    });

    it('accepts valid search filters within constraints', () => {
      const validQuery = {
        page: 2,
        pageSize: 25,
        search: 'Ayush',
        minExperience: 5,
        maxFee: 1000,
        verificationStatus: 'VERIFIED'
      };

      const result = listDoctorsQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(25);
    });
  });
});
