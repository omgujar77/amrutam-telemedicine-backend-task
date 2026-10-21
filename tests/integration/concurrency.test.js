import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma, checkDatabaseConnection } from '../../src/config/database.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Real PostgreSQL Concurrency & Double-Booking Prevention Integration Tests (Phase 4)', () => {
  let isDbAvailable = false;
  const testRunId = Date.now().toString(36);

  let doctorUser;
  let doctorProfile;
  let patientAUser;
  let patientAToken;
  let patientBUser;
  let patientBToken;

  const createdSlotIds = [];
  const createdUserIds = [];

  beforeAll(async () => {
    const check = await checkDatabaseConnection(5000);
    isDbAvailable = check.isReady;

    if (!isDbAvailable) {
      console.warn('⚠️  PostgreSQL is not reachable. Live concurrency integration tests will be skipped.');
      return;
    }

    // 1. Create Doctor User and Doctor Profile in real PostgreSQL
    doctorUser = await prisma.user.create({
      data: {
        email: `dr.concurrency.${testRunId}@amrutam.local`,
        name: 'Dr. Concurrency Tester',
        passwordHash: 'dummy_hash_for_testing',
        role: 'DOCTOR',
        status: 'ACTIVE',
        doctorProfile: {
          create: {
            qualifications: 'BAMS, MD',
            specialization: 'Ayurvedic Medicine',
            consultationFee: 600.0,
            verificationStatus: 'VERIFIED'
          }
        }
      },
      include: { doctorProfile: true }
    });
    doctorProfile = doctorUser.doctorProfile;
    createdUserIds.push(doctorUser.id);

    // 2. Create Patient A in real PostgreSQL
    patientAUser = await prisma.user.create({
      data: {
        email: `patient.a.${testRunId}@amrutam.local`,
        name: 'Patient Alpha',
        passwordHash: 'dummy_hash_for_testing',
        role: 'PATIENT',
        status: 'ACTIVE',
        patientProfile: {
          create: {
            bloodGroup: 'A+'
          }
        }
      },
      include: { patientProfile: true }
    });
    patientAToken = tokenService.generateAccessToken(patientAUser);
    createdUserIds.push(patientAUser.id);

    // 3. Create Patient B in real PostgreSQL
    patientBUser = await prisma.user.create({
      data: {
        email: `patient.b.${testRunId}@amrutam.local`,
        name: 'Patient Beta',
        passwordHash: 'dummy_hash_for_testing',
        role: 'PATIENT',
        status: 'ACTIVE',
        patientProfile: {
          create: {
            bloodGroup: 'B+'
          }
        }
      },
      include: { patientProfile: true }
    });
    patientBToken = tokenService.generateAccessToken(patientBUser);
    createdUserIds.push(patientBUser.id);
  });

  afterAll(async () => {
    if (!isDbAvailable) return;

    try {
      // Deterministic cleanup
      if (createdSlotIds.length > 0) {
        await prisma.consultation.deleteMany({
          where: { slotId: { in: createdSlotIds } }
        });
        await prisma.availabilitySlot.deleteMany({
          where: { id: { in: createdSlotIds } }
        });
      }

      if (createdUserIds.length > 0) {
        await prisma.idempotencyRecord.deleteMany({
          where: { userId: { in: createdUserIds } }
        });
        await prisma.user.deleteMany({
          where: { id: { in: createdUserIds } }
        });
      }
    } catch (err) {
      console.warn('Cleanup warning in concurrency tests:', err.message);
    }
  });

  it('prevents simultaneous double-booking when two different patients book the exact same slot concurrently', async ({ skip }) => {
    if (!isDbAvailable) return skip();

    // 1. Create a single available slot
    const startTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

    const slot = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctorProfile.id,
        startTime,
        endTime,
        status: 'AVAILABLE'
      }
    });
    createdSlotIds.push(slot.id);

    // 2. Prepare simultaneous requests from Patient A and Patient B
    const requestA = request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientAToken}`)
      .set('Idempotency-Key', `patient-a-key-${testRunId}`)
      .send({ slotId: slot.id });

    const requestB = request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientBToken}`)
      .set('Idempotency-Key', `patient-b-key-${testRunId}`)
      .send({ slotId: slot.id });

    // 3. Fire both requests simultaneously using Promise.all
    const [resA, resB] = await Promise.all([requestA, requestB]);

    const statuses = [resA.status, resB.status].sort();

    // 4. Exactly one request must succeed (201) and the other must be rejected with 409 Conflict
    expect(statuses).toEqual([201, 409]);

    const winner = resA.status === 201 ? resA : resB;
    const loser = resA.status === 409 ? resA : resB;

    expect(winner.body.success).toBe(true);
    expect(winner.body.data.slotId).toBe(slot.id);
    expect(winner.body.isReplay).toBe(false);

    expect(loser.body.success).toBe(false);
    expect(loser.body.error.code).toBe('SLOT_UNAVAILABLE');

    // 5. Verify database integrity
    const updatedSlot = await prisma.availabilitySlot.findUnique({
      where: { id: slot.id }
    });
    expect(updatedSlot.status).toBe('BOOKED');

    const consultations = await prisma.consultation.findMany({
      where: { slotId: slot.id }
    });
    expect(consultations).toHaveLength(1);
    expect(consultations[0].id).toBe(winner.body.data.id);

    // Verify loser did NOT create an orphaned idempotency record
    const loserId = resA.status === 409 ? patientAUser.id : patientBUser.id;
    const loserIdempotencyKey = resA.status === 409 ? `patient-a-key-${testRunId}` : `patient-b-key-${testRunId}`;

    const loserRecord = await prisma.idempotencyRecord.findUnique({
      where: {
        unique_user_operation_idempotency: {
          userId: loserId,
          operation: 'booking:create',
          idempotencyKey: loserIdempotencyKey
        }
      }
    });
    expect(loserRecord).toBeNull();
  });

  it('safely handles concurrent requests with the SAME idempotency key from the same patient', async ({ skip }) => {
    if (!isDbAvailable) return skip();

    // 1. Create a single available slot
    const startTime = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

    const slot = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctorProfile.id,
        startTime,
        endTime,
        status: 'AVAILABLE'
      }
    });
    createdSlotIds.push(slot.id);

    const sameKey = `same-key-${testRunId}-${Date.now()}`;

    // 2. Prepare two simultaneous requests from the same patient with the exact same idempotency key
    const req1 = request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientAToken}`)
      .set('Idempotency-Key', sameKey)
      .send({ slotId: slot.id });

    const req2 = request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${patientAToken}`)
      .set('Idempotency-Key', sameKey)
      .send({ slotId: slot.id });

    const [res1, res2] = await Promise.all([req1, req2]);

    // Both should yield a successful logical booking (either 201 or 200 replay)
    expect([200, 201]).toContain(res1.status);
    expect([200, 201]).toContain(res2.status);

    // Verify both responses point to the identical consultation record
    const bookingId1 = res1.body.data?.id;
    const bookingId2 = res2.body.data?.id;
    expect(bookingId1).toBe(bookingId2);

    // Verify database only created 1 consultation and 1 idempotency record
    const countConsultations = await prisma.consultation.count({
      where: { slotId: slot.id }
    });
    expect(countConsultations).toBe(1);

    const countIdempotency = await prisma.idempotencyRecord.count({
      where: {
        userId: patientAUser.id,
        operation: 'booking:create',
        idempotencyKey: sameKey
      }
    });
    expect(countIdempotency).toBe(1);
  });
});
