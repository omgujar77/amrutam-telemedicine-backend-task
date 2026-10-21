import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

// Spy on prisma models
vi.spyOn(prisma.user, 'findUnique');
vi.spyOn(prisma.doctorProfile, 'findUnique');
vi.spyOn(prisma.doctorProfile, 'count');
vi.spyOn(prisma.doctorProfile, 'findMany');
vi.spyOn(prisma.availabilitySlot, 'findFirst');
vi.spyOn(prisma.availabilitySlot, 'findUnique');
vi.spyOn(prisma.availabilitySlot, 'create');
vi.spyOn(prisma.availabilitySlot, 'findMany');
vi.spyOn(prisma.availabilitySlot, 'count');
vi.spyOn(prisma.availabilitySlot, 'delete');

describe('Doctor Availability & Search Unit Tests (Phase 4)', () => {
  const doctorUser = {
    id: 'doctor-user-uuid-1',
    email: 'dr.ayush@amrutam.local',
    name: 'Dr. Ayush Sharma',
    role: 'DOCTOR',
    status: 'ACTIVE'
  };

  const patientUser = {
    id: 'patient-user-uuid-1',
    email: 'patient@amrutam.local',
    name: 'Patient One',
    role: 'PATIENT',
    status: 'ACTIVE'
  };

  const doctorProfile = {
    id: 'doctor-profile-uuid-1',
    userId: doctorUser.id,
    qualifications: 'BAMS, MD Ayurveda',
    specialization: 'Ayurveda & Panchakarma',
    consultationFee: 500,
    verificationStatus: 'VERIFIED'
  };

  let doctorToken;
  let patientToken;

  beforeEach(() => {
    vi.clearAllMocks();
    doctorToken = tokenService.generateAccessToken(doctorUser);
    patientToken = tokenService.generateAccessToken(patientUser);
  });

  describe('POST /api/v1/doctors/me/availability', () => {
    it('creates an availability slot for the authenticated doctor', async () => {
      // 1. Authenticate user
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      // 2. Find doctor profile
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      // 3. Exact duplicate check (none)
      prisma.availabilitySlot.findFirst.mockResolvedValueOnce(null);
      // 4. Overlap check (none)
      prisma.availabilitySlot.findFirst.mockResolvedValueOnce(null);

      const createdSlot = {
        id: 'slot-1',
        doctorId: doctorProfile.id,
        startTime: new Date('2026-11-10T09:00:00.000Z'),
        endTime: new Date('2026-11-10T09:30:00.000Z'),
        status: 'AVAILABLE'
      };
      prisma.availabilitySlot.create.mockResolvedValueOnce(createdSlot);

      const response = await request(app)
        .post('/api/v1/doctors/me/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          startTime: '2026-11-10T09:00:00.000Z',
          endTime: '2026-11-10T09:30:00.000Z'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('slot-1');
      expect(response.body.data.status).toBe('AVAILABLE');
    });

    it('rejects slot creation if user is a PATIENT (RBAC)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);

      const response = await request(app)
        .post('/api/v1/doctors/me/availability')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          startTime: '2026-11-10T09:00:00.000Z',
          endTime: '2026-11-10T09:30:00.000Z'
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects slot creation without authentication (401)', async () => {
      const response = await request(app)
        .post('/api/v1/doctors/me/availability')
        .send({
          startTime: '2026-11-10T09:00:00.000Z',
          endTime: '2026-11-10T09:30:00.000Z'
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects past timestamps', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);

      const response = await request(app)
        .post('/api/v1/doctors/me/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          startTime: '2020-01-01T09:00:00.000Z',
          endTime: '2020-01-01T09:30:00.000Z'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects endTime earlier than or equal to startTime', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);

      const response = await request(app)
        .post('/api/v1/doctors/me/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          startTime: '2026-11-10T10:00:00.000Z',
          endTime: '2026-11-10T09:30:00.000Z'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects exact duplicate slots with 409', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.availabilitySlot.findFirst.mockResolvedValueOnce({ id: 'existing-slot' });

      const response = await request(app)
        .post('/api/v1/doctors/me/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          startTime: '2026-11-10T09:00:00.000Z',
          endTime: '2026-11-10T09:30:00.000Z'
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('SLOT_DUPLICATE');
    });

    it('rejects overlapping slots with 409', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.availabilitySlot.findFirst
        .mockResolvedValueOnce(null) // no exact duplicate
        .mockResolvedValueOnce({ id: 'overlapping-slot' }); // overlap found

      const response = await request(app)
        .post('/api/v1/doctors/me/availability')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          startTime: '2026-11-10T09:15:00.000Z',
          endTime: '2026-11-10T09:45:00.000Z'
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('SLOT_OVERLAP');
    });
  });

  describe('DELETE /api/v1/doctors/me/availability/:slotId', () => {
    it('deletes an unbooked slot successfully', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.availabilitySlot.findUnique.mockResolvedValueOnce({
        id: 'slot-1',
        doctorId: doctorProfile.id,
        status: 'AVAILABLE'
      });
      prisma.availabilitySlot.delete.mockResolvedValueOnce({ id: 'slot-1' });

      const response = await request(app)
        .delete('/api/v1/doctors/me/availability/slot-1')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.deleted).toBe(true);
    });

    it('rejects deletion of a slot that is already booked (409)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.availabilitySlot.findUnique.mockResolvedValueOnce({
        id: 'slot-1',
        doctorId: doctorProfile.id,
        status: 'BOOKED'
      });

      const response = await request(app)
        .delete('/api/v1/doctors/me/availability/slot-1')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('SLOT_ALREADY_BOOKED');
    });
  });

  describe('GET /api/v1/doctors (Doctor search)', () => {
    it('searches doctors with pagination and filters', async () => {
      prisma.doctorProfile.count.mockResolvedValueOnce(1);
      prisma.doctorProfile.findMany.mockResolvedValueOnce([
        {
          id: doctorProfile.id,
          userId: doctorUser.id,
          qualifications: 'BAMS',
          specialization: 'Ayurveda',
          consultationFee: 500,
          user: { id: doctorUser.id, name: 'Dr. Ayush', email: 'dr@amrutam.local', role: 'DOCTOR' }
        }
      ]);

      const response = await request(app)
        .get('/api/v1/doctors?specialization=Ayurveda&page=1&pageSize=10');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.total).toBe(1);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.pageSize).toBe(10);
    });

    it('searches doctors by verificationStatus, availableDate, and fee range', async () => {
      prisma.doctorProfile.count.mockResolvedValueOnce(1);
      prisma.doctorProfile.findMany.mockResolvedValueOnce([
        {
          id: doctorProfile.id,
          userId: doctorUser.id,
          qualifications: 'BAMS',
          specialization: 'Ayurveda',
          consultationFee: 400,
          experienceYears: 8,
          verificationStatus: 'VERIFIED',
          user: { id: doctorUser.id, name: 'Dr. Ayush', email: 'dr@amrutam.local', role: 'DOCTOR' }
        }
      ]);

      const response = await request(app)
        .get('/api/v1/doctors?verificationStatus=VERIFIED&availableDate=2026-11-15&maxFee=600&minExperience=5');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].verificationStatus).toBe('VERIFIED');
    });

    it('enforces maximum pagination bounds (max 50)', async () => {
      const response = await request(app)
        .get('/api/v1/doctors?pageSize=100');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates invalid date format for availableDate (400)', async () => {
      const response = await request(app)
        .get('/api/v1/doctors?availableDate=invalid-date');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/doctors/:doctorId/availability', () => {
    it('returns bookable slots for a doctor', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.availabilitySlot.count.mockResolvedValueOnce(1);
      prisma.availabilitySlot.findMany.mockResolvedValueOnce([
        {
          id: 'slot-1',
          doctorId: doctorProfile.id,
          startTime: new Date('2026-11-10T09:00:00.000Z'),
          endTime: new Date('2026-11-10T09:30:00.000Z'),
          status: 'AVAILABLE'
        }
      ]);

      const response = await request(app)
        .get(`/api/v1/doctors/${doctorProfile.id}/availability`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('AVAILABLE');
    });

    it('returns 404 if doctor does not exist', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/v1/doctors/nonexistent-id/availability');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('DOCTOR_NOT_FOUND');
    });
  });
});
