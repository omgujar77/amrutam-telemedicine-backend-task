import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

vi.spyOn(prisma.user, 'findUnique');
vi.spyOn(prisma.doctorProfile, 'findUnique');
vi.spyOn(prisma.patientProfile, 'findUnique');
vi.spyOn(prisma.consultation, 'findUnique');
vi.spyOn(prisma.consultation, 'findMany');
vi.spyOn(prisma.consultation, 'count');
vi.spyOn(prisma.consultation, 'updateMany');
vi.spyOn(prisma.auditLog, 'create');
vi.spyOn(prisma, '$transaction');

describe('Consultation Lifecycle & Authorization Unit Tests (Phase 5)', () => {
  const doctorUser = {
    id: 'doctor-user-uuid-1',
    email: 'dr.ayush@amrutam.local',
    name: 'Dr. Ayush Sharma',
    role: 'DOCTOR',
    status: 'ACTIVE'
  };

  const unrelatedDoctorUser = {
    id: 'doctor-user-uuid-2',
    email: 'dr.unrelated@amrutam.local',
    name: 'Dr. Unrelated',
    role: 'DOCTOR',
    status: 'ACTIVE'
  };

  const patientUser = {
    id: 'patient-user-uuid-1',
    email: 'patient@amrutam.local',
    name: 'Patient Alpha',
    role: 'PATIENT',
    status: 'ACTIVE'
  };

  const otherPatientUser = {
    id: 'patient-user-uuid-2',
    email: 'patient.other@amrutam.local',
    name: 'Patient Beta',
    role: 'PATIENT',
    status: 'ACTIVE'
  };

  const doctorProfile = {
    id: 'doctor-profile-uuid-1',
    userId: doctorUser.id,
    specialization: 'Ayurveda'
  };

  const unrelatedDoctorProfile = {
    id: 'doctor-profile-uuid-2',
    userId: unrelatedDoctorUser.id,
    specialization: 'Ayurveda'
  };

  const patientProfile = {
    id: 'patient-profile-uuid-1',
    userId: patientUser.id
  };

  let doctorToken;
  let unrelatedDoctorToken;
  let patientToken;
  let otherPatientToken;

  beforeEach(() => {
    vi.clearAllMocks();
    doctorToken = tokenService.generateAccessToken(doctorUser);
    unrelatedDoctorToken = tokenService.generateAccessToken(unrelatedDoctorUser);
    patientToken = tokenService.generateAccessToken(patientUser);
    otherPatientToken = tokenService.generateAccessToken(otherPatientUser);
  });

  describe('POST /api/v1/consultations/:consultationId/start', () => {
    it('allows assigned doctor to start a SCHEDULED consultation (transitions to IN_PROGRESS)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        doctorId: doctorProfile.id,
        patientId: patientProfile.id,
        status: 'SCHEDULED',
        scheduledAt: new Date()
      });

      const updatedConsultation = {
        id: 'consultation-1',
        doctorId: doctorProfile.id,
        patientId: patientProfile.id,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        patient: { id: patientProfile.id, user: { name: 'Patient Alpha' } },
        doctor: { id: doctorProfile.id, specialization: 'Ayurveda' },
        slot: { id: 'slot-1', status: 'BOOKED' }
      };

      prisma.$transaction.mockImplementationOnce(async (callback) => {
        const tx = {
          consultation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findUnique: vi.fn().mockResolvedValue(updatedConsultation)
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: 'audit-1' })
          }
        };
        return callback(tx);
      });

      const response = await request(app)
        .post('/api/v1/consultations/consultation-1/start')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('IN_PROGRESS');
    });

    it('rejects patient attempting to start a consultation (403 Forbidden)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);

      const response = await request(app)
        .post('/api/v1/consultations/consultation-1/start')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects unrelated doctor from starting another doctor consultation (403 Forbidden)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(unrelatedDoctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(unrelatedDoctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        doctorId: doctorProfile.id, // assigned to doctor 1, not doctor 2
        patientId: patientProfile.id,
        status: 'SCHEDULED'
      });

      const response = await request(app)
        .post('/api/v1/consultations/consultation-1/start')
        .set('Authorization', `Bearer ${unrelatedDoctorToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects starting an already started (IN_PROGRESS) consultation (409 Conflict)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        doctorId: doctorProfile.id,
        status: 'IN_PROGRESS'
      });

      const response = await request(app)
        .post('/api/v1/consultations/consultation-1/start')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('rejects starting a COMPLETED consultation (409 Conflict)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        doctorId: doctorProfile.id,
        status: 'COMPLETED'
      });

      const response = await request(app)
        .post('/api/v1/consultations/consultation-1/start')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('POST /api/v1/consultations/:consultationId/complete', () => {
    it('allows assigned doctor to complete an IN_PROGRESS consultation', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        doctorId: doctorProfile.id,
        patientId: patientProfile.id,
        status: 'IN_PROGRESS'
      });

      const completedConsultation = {
        id: 'consultation-1',
        doctorId: doctorProfile.id,
        status: 'COMPLETED',
        completedAt: new Date(),
        notes: 'Patient showed great improvement'
      };

      prisma.$transaction.mockImplementationOnce(async (callback) => {
        const tx = {
          consultation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findUnique: vi.fn().mockResolvedValue(completedConsultation)
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: 'audit-2' })
          }
        };
        return callback(tx);
      });

      const response = await request(app)
        .post('/api/v1/consultations/consultation-1/complete')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ notes: 'Patient showed great improvement' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('COMPLETED');
    });

    it('rejects completing a SCHEDULED consultation before starting (409 Conflict)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        doctorId: doctorProfile.id,
        status: 'SCHEDULED'
      });

      const response = await request(app)
        .post('/api/v1/consultations/consultation-1/complete')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('GET /api/v1/consultations/:consultationId', () => {
    it('allows associated patient to retrieve their consultation', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        patient: { id: patientProfile.id, userId: patientUser.id },
        doctor: { id: doctorProfile.id, userId: doctorUser.id },
        status: 'SCHEDULED',
        scheduledAt: new Date()
      });

      const response = await request(app)
        .get('/api/v1/consultations/consultation-1')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('consultation-1');
    });

    it('forbids an unrelated patient from accessing the consultation (403 Forbidden)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(otherPatientUser);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        patient: { id: patientProfile.id, userId: patientUser.id },
        doctor: { id: doctorProfile.id, userId: doctorUser.id },
        status: 'SCHEDULED'
      });

      const response = await request(app)
        .get('/api/v1/consultations/consultation-1')
        .set('Authorization', `Bearer ${otherPatientToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 if consultation does not exist', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);
      prisma.consultation.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/v1/consultations/nonexistent-id')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('CONSULTATION_NOT_FOUND');
    });
  });

  describe('GET /api/v1/consultations/me', () => {
    it('returns consultations for authenticated patient', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);
      prisma.patientProfile.findUnique.mockResolvedValueOnce(patientProfile);
      prisma.consultation.count.mockResolvedValueOnce(1);
      prisma.consultation.findMany.mockResolvedValueOnce([
        {
          id: 'consultation-1',
          status: 'SCHEDULED',
          scheduledAt: new Date()
        }
      ]);

      const response = await request(app)
        .get('/api/v1/consultations/me')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.total).toBe(1);
    });
  });
});
