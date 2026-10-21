import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

vi.spyOn(prisma.user, 'findUnique');
vi.spyOn(prisma.doctorProfile, 'findUnique');
vi.spyOn(prisma.consultation, 'findUnique');
vi.spyOn(prisma.prescription, 'findUnique');
vi.spyOn(prisma.prescription, 'findMany');
vi.spyOn(prisma.prescription, 'count');
vi.spyOn(prisma.prescription, 'create');
vi.spyOn(prisma.auditLog, 'create');
vi.spyOn(prisma, '$transaction');

describe('Prescription Management & Security Unit Tests (Phase 5)', () => {
  const doctorUser = {
    id: 'doctor-user-uuid-1',
    email: 'dr.ayush@amrutam.local',
    name: 'Dr. Ayush Sharma',
    role: 'DOCTOR',
    status: 'ACTIVE'
  };

  const unrelatedDoctorUser = {
    id: 'doctor-user-uuid-2',
    email: 'dr.other@amrutam.local',
    name: 'Dr. Other',
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
    email: 'patient.beta@amrutam.local',
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

  const validPrescriptionPayload = {
    medicines: [
      {
        name: 'Ashwagandha Churna',
        dosage: '1 teaspoon (3g)',
        frequency: 'Twice daily with warm milk',
        duration: '30 days'
      },
      {
        name: 'Triphala Tablets',
        dosage: '2 tablets (500mg)',
        frequency: 'Once daily at bedtime',
        duration: '15 days'
      }
    ],
    dosageInstructions: 'Take medications strictly after meals with warm water or milk as indicated.',
    advice: 'Follow a Sattvic diet, avoid heavy fermented foods, and practice mild pranayama daily.'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    doctorToken = tokenService.generateAccessToken(doctorUser);
    unrelatedDoctorToken = tokenService.generateAccessToken(unrelatedDoctorUser);
    patientToken = tokenService.generateAccessToken(patientUser);
    otherPatientToken = tokenService.generateAccessToken(otherPatientUser);
  });

  describe('POST /api/v1/consultations/:consultationId/prescriptions', () => {
    it('allows assigned doctor to create a prescription for an IN_PROGRESS consultation', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        doctorId: doctorProfile.id,
        patientId: patientProfile.id,
        status: 'IN_PROGRESS'
      });

      const mockPrescription = {
        id: 'prescription-uuid-1',
        consultationId: 'consultation-1',
        prescribingDoctorId: doctorProfile.id,
        ...validPrescriptionPayload
      };

      prisma.$transaction.mockImplementationOnce(async (callback) => {
        const tx = {
          prescription: {
            create: vi.fn().mockResolvedValue(mockPrescription)
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: 'audit-1' })
          }
        };
        return callback(tx);
      });

      const response = await request(app)
        .post('/api/v1/consultations/consultation-1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(validPrescriptionPayload);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('prescription-uuid-1');
    });

    it('rejects patient from creating a prescription (403 Forbidden)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);

      const response = await request(app)
        .post('/api/v1/consultations/consultation-1/prescriptions')
        .set('Authorization', `Bearer ${patientToken}`)
        .send(validPrescriptionPayload);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects an unrelated doctor from prescribing (403 Forbidden)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(unrelatedDoctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(unrelatedDoctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        doctorId: doctorProfile.id, // assigned to Dr. 1
        patientId: patientProfile.id,
        status: 'IN_PROGRESS'
      });

      const response = await request(app)
        .post('/api/v1/consultations/consultation-1/prescriptions')
        .set('Authorization', `Bearer ${unrelatedDoctorToken}`)
        .send(validPrescriptionPayload);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects prescription creation if consultation is still SCHEDULED (409 Conflict)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        doctorId: doctorProfile.id,
        patientId: patientProfile.id,
        status: 'SCHEDULED'
      });

      const response = await request(app)
        .post('/api/v1/consultations/consultation-1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(validPrescriptionPayload);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_CONSULTATION_STATE');
    });

    it('rejects empty medicines list with 400 VALIDATION_ERROR', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);

      const response = await request(app)
        .post('/api/v1/consultations/consultation-1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          medicines: [],
          dosageInstructions: 'Take once daily'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/consultations/:consultationId/prescriptions', () => {
    it('allows patient to view prescriptions for their own consultation', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        patient: { id: patientProfile.id, userId: patientUser.id },
        doctor: { id: doctorProfile.id, userId: doctorUser.id }
      });
      prisma.prescription.findMany.mockResolvedValueOnce([
        {
          id: 'rx-1',
          consultationId: 'consultation-1',
          medicines: validPrescriptionPayload.medicines
        }
      ]);

      const response = await request(app)
        .get('/api/v1/consultations/consultation-1/prescriptions')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('forbids an unrelated patient from accessing consultation prescriptions (403 Forbidden)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(otherPatientUser);
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-1',
        patient: { id: patientProfile.id, userId: patientUser.id },
        doctor: { id: doctorProfile.id, userId: doctorUser.id }
      });

      const response = await request(app)
        .get('/api/v1/consultations/consultation-1/prescriptions')
        .set('Authorization', `Bearer ${otherPatientToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/prescriptions/:prescriptionId', () => {
    it('allows associated patient to retrieve prescription by ID', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);
      prisma.prescription.findUnique.mockResolvedValueOnce({
        id: 'rx-1',
        consultationId: 'consultation-1',
        consultation: {
          patient: { id: patientProfile.id, userId: patientUser.id },
          doctor: { id: doctorProfile.id, userId: doctorUser.id }
        },
        prescribingDoctor: {
          id: doctorProfile.id,
          specialization: 'Ayurveda',
          user: { name: 'Dr. Ayush' }
        },
        ...validPrescriptionPayload
      });

      const response = await request(app)
        .get('/api/v1/prescriptions/rx-1')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('rx-1');
    });

    it('returns 404 when prescription does not exist', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);
      prisma.prescription.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/v1/prescriptions/nonexistent-id')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PRESCRIPTION_NOT_FOUND');
    });
  });

  describe('GET /api/v1/prescriptions/me', () => {
    it('allows patient to retrieve their own paginated prescriptions', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);
      prisma.prescription.count.mockResolvedValueOnce(1);
      prisma.prescription.findMany.mockResolvedValueOnce([
        {
          id: 'rx-1',
          consultationId: 'consultation-1',
          prescribingDoctor: {
            id: doctorProfile.id,
            specialization: 'Ayurveda',
            user: { id: doctorUser.id, name: 'Dr. Ayush Sharma', email: doctorUser.email }
          },
          consultation: {
            id: 'consultation-1',
            status: 'COMPLETED',
            scheduledAt: new Date(),
            patient: { id: patientProfile.id, user: { id: patientUser.id, name: 'Patient Alpha' } }
          }
        }
      ]);

      const res = await request(app)
        .get('/api/v1/prescriptions/me?page=1&pageSize=10')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBe(1);
    });

    it('allows doctor to retrieve their issued prescriptions', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.prescription.count.mockResolvedValueOnce(2);
      prisma.prescription.findMany.mockResolvedValueOnce([
        { id: 'rx-1', consultationId: 'consultation-1' },
        { id: 'rx-2', consultationId: 'consultation-2' }
      ]);

      const res = await request(app)
        .get('/api/v1/prescriptions/me?page=1&pageSize=5')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.pageSize).toBe(5);
    });
  });
});
