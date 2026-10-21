import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

vi.spyOn(prisma.user, 'findUnique');
vi.spyOn(prisma.patientProfile, 'findUnique');
vi.spyOn(prisma.doctorProfile, 'findUnique');
vi.spyOn(prisma.idempotencyRecord, 'findUnique');
vi.spyOn(prisma.idempotencyRecord, 'create');
vi.spyOn(prisma.consultation, 'findMany');
vi.spyOn(prisma.consultation, 'count');
vi.spyOn(prisma, '$transaction');

describe('Booking API & Idempotency Unit Tests (Phase 4)', () => {
  const patientUser = {
    id: 'patient-user-uuid-1',
    email: 'patient@amrutam.local',
    name: 'Patient User',
    role: 'PATIENT',
    status: 'ACTIVE'
  };

  const doctorUser = {
    id: 'doctor-user-uuid-1',
    email: 'dr.ayush@amrutam.local',
    name: 'Dr. Ayush Sharma',
    role: 'DOCTOR',
    status: 'ACTIVE'
  };

  const patientProfile = {
    id: 'patient-profile-1',
    userId: patientUser.id
  };

  const doctorProfile = {
    id: 'doctor-profile-1',
    userId: doctorUser.id
  };

  let patientToken;
  let doctorToken;

  beforeEach(() => {
    vi.clearAllMocks();
    patientToken = tokenService.generateAccessToken(patientUser);
    doctorToken = tokenService.generateAccessToken(doctorUser);
  });

  describe('POST /api/v1/bookings', () => {
    it('creates a new booking when slot is available (HTTP 201)', async () => {
      // 1. Authenticate user
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);
      // 2. Fast idempotency check (none)
      prisma.idempotencyRecord.findUnique.mockResolvedValueOnce(null);

      // 3. Mock transaction execution
      const mockConsultation = {
        id: 'consultation-1',
        patientId: patientProfile.id,
        doctorId: doctorProfile.id,
        slotId: 'slot-uuid-1',
        status: 'SCHEDULED',
        scheduledAt: new Date('2026-11-10T10:00:00.000Z')
      };

      prisma.$transaction.mockImplementationOnce(async (callback) => {
        const tx = {
          patientProfile: {
            findUnique: vi.fn().mockResolvedValue(patientProfile),
            create: vi.fn()
          },
          availabilitySlot: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'slot-uuid-1',
              doctorId: doctorProfile.id,
              startTime: new Date('2026-11-10T10:00:00.000Z'),
              status: 'AVAILABLE'
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 })
          },
          consultation: {
            create: vi.fn().mockResolvedValue(mockConsultation)
          },
          idempotencyRecord: {
            create: vi.fn().mockResolvedValue({})
          }
        };
        return callback(tx);
      });

      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', 'unique-key-100')
        .send({ slotId: 'slot-uuid-1' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.isReplay).toBe(false);
      expect(response.body.data.id).toBe('consultation-1');
    });

    it('requires Idempotency-Key header (HTTP 400)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);

      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ slotId: 'slot-uuid-1' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('returns original booking on idempotency replay (HTTP 200, isReplay: true)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);

      const cachedBooking = {
        id: 'consultation-cached-1',
        slotId: 'slot-uuid-1',
        status: 'SCHEDULED'
      };

      // Import service to compute exact request hash
      const { bookingService } = await import('../../src/modules/bookings/booking.service.js');
      const expectedHash = bookingService.generateRequestHash({ slotId: 'slot-uuid-1' });

      prisma.idempotencyRecord.findUnique.mockResolvedValueOnce({
        id: 'record-1',
        userId: patientUser.id,
        operation: 'booking:create',
        idempotencyKey: 'key-123',
        requestHash: expectedHash,
        responseBody: cachedBooking
      });

      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', 'key-123')
        .send({ slotId: 'slot-uuid-1' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isReplay).toBe(true);
      expect(response.body.data.id).toBe('consultation-cached-1');
    });

    it('rejects reusing the same idempotency key for a different slot (HTTP 409)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);

      prisma.idempotencyRecord.findUnique.mockResolvedValueOnce({
        id: 'record-1',
        userId: patientUser.id,
        operation: 'booking:create',
        idempotencyKey: 'key-123',
        requestHash: 'different-hash-for-other-slot',
        responseBody: {}
      });

      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', 'key-123')
        .send({ slotId: 'slot-uuid-2' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
    });

    it('returns HTTP 409 when slot is already booked', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);
      prisma.idempotencyRecord.findUnique.mockResolvedValueOnce(null);

      prisma.$transaction.mockImplementationOnce(async (callback) => {
        const tx = {
          patientProfile: {
            findUnique: vi.fn().mockResolvedValue(patientProfile),
            create: vi.fn()
          },
          availabilitySlot: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'slot-uuid-1',
              status: 'BOOKED'
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 0 })
          }
        };
        return callback(tx);
      });

      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('Idempotency-Key', 'key-conflict')
        .send({ slotId: 'slot-uuid-1' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('SLOT_UNAVAILABLE');
    });

    it('rejects a DOCTOR user attempting to book as a patient (HTTP 403)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);

      const response = await request(app)
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${doctorToken}`)
        .set('Idempotency-Key', 'doc-key')
        .send({ slotId: 'slot-uuid-1' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/bookings/me', () => {
    it('returns bookings for authenticated patient', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);
      prisma.patientProfile.findUnique.mockResolvedValueOnce(patientProfile);
      prisma.consultation.count.mockResolvedValueOnce(1);
      prisma.consultation.findMany.mockResolvedValueOnce([
        {
          id: 'booking-1',
          status: 'SCHEDULED',
          scheduledAt: new Date('2026-11-10T10:00:00.000Z'),
          doctor: { id: doctorProfile.id, specialization: 'Ayurveda', user: { name: 'Dr. Ayush' } },
          slot: { id: 'slot-1', status: 'BOOKED' }
        }
      ]);

      const response = await request(app)
        .get('/api/v1/bookings/me')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.total).toBe(1);
    });
  });

  describe('GET /api/v1/doctors/me/bookings', () => {
    it('returns bookings assigned to authenticated doctor', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce(doctorProfile);
      prisma.consultation.count.mockResolvedValueOnce(1);
      prisma.consultation.findMany.mockResolvedValueOnce([
        {
          id: 'booking-1',
          status: 'SCHEDULED',
          scheduledAt: new Date('2026-11-10T10:00:00.000Z'),
          patient: { id: patientProfile.id, user: { name: 'Patient One' } },
          slot: { id: 'slot-1', status: 'BOOKED' }
        }
      ]);

      const response = await request(app)
        .get('/api/v1/doctors/me/bookings')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.total).toBe(1);
    });
  });
});
