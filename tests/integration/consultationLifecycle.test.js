import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma, checkDatabaseConnection } from '../../src/config/database.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Real PostgreSQL Consultation Lifecycle & Prescriptions Integration Tests (Phase 5)', () => {
  let isDbAvailable = false;
  const testRunId = Date.now().toString(36);

  let doctorUser;
  let doctorProfile;
  let doctorToken;

  let patientUser;
  let patientProfile;
  let patientToken;

  let slot;
  let consultation;

  beforeAll(async () => {
    const check = await checkDatabaseConnection(5000);
    isDbAvailable = check.isReady;

    if (!isDbAvailable) {
      console.warn('⚠️  PostgreSQL is not reachable. Live consultation lifecycle tests will be skipped.');
      return;
    }

    // 1. Create Doctor
    doctorUser = await prisma.user.create({
      data: {
        email: `dr.lifecycle.${testRunId}@amrutam.local`,
        name: 'Dr. Lifecycle Tester',
        passwordHash: 'dummy_hash',
        role: 'DOCTOR',
        status: 'ACTIVE',
        doctorProfile: {
          create: {
            qualifications: 'BAMS, MD',
            specialization: 'Ayurveda',
            consultationFee: 750.0,
            verificationStatus: 'VERIFIED'
          }
        }
      },
      include: { doctorProfile: true }
    });
    doctorProfile = doctorUser.doctorProfile;
    doctorToken = tokenService.generateAccessToken(doctorUser);

    // 2. Create Patient
    patientUser = await prisma.user.create({
      data: {
        email: `patient.lifecycle.${testRunId}@amrutam.local`,
        name: 'Patient Lifecycle Tester',
        passwordHash: 'dummy_hash',
        role: 'PATIENT',
        status: 'ACTIVE',
        patientProfile: {
          create: {
            bloodGroup: 'AB+'
          }
        }
      },
      include: { patientProfile: true }
    });
    patientProfile = patientUser.patientProfile;
    patientToken = tokenService.generateAccessToken(patientUser);

    // 3. Create Slot & Scheduled Consultation
    const startTime = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

    slot = await prisma.availabilitySlot.create({
      data: {
        doctorId: doctorProfile.id,
        startTime,
        endTime,
        status: 'BOOKED'
      }
    });

    consultation = await prisma.consultation.create({
      data: {
        patientId: patientProfile.id,
        doctorId: doctorProfile.id,
        slotId: slot.id,
        status: 'SCHEDULED',
        scheduledAt: startTime
      }
    });
  });

  afterAll(async () => {
    if (!isDbAvailable) return;

    try {
      if (consultation?.id) {
        await prisma.prescription.deleteMany({
          where: { consultationId: consultation.id }
        });
        await prisma.consultation.deleteMany({
          where: { id: consultation.id }
        });
      }

      if (slot?.id) {
        await prisma.availabilitySlot.deleteMany({
          where: { id: slot.id }
        });
      }

      if (doctorUser?.id || patientUser?.id) {
        const userIds = [doctorUser?.id, patientUser?.id].filter(Boolean);
        await prisma.auditLog.deleteMany({
          where: { actorId: { in: userIds } }
        });
        await prisma.user.deleteMany({
          where: { id: { in: userIds } }
        });
      }
    } catch (err) {
      console.warn('Cleanup warning in consultation lifecycle test:', err.message);
    }
  });

  it('enforces complete consultation lifecycle transitions (SCHEDULED -> IN_PROGRESS -> COMPLETED) with persistent audit logs', async ({ skip }) => {
    if (!isDbAvailable) return skip();

    // 1. Doctor starts consultation: transitions to IN_PROGRESS
    const startRes = await request(app)
      .post(`/api/v1/consultations/${consultation.id}/start`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(startRes.status).toBe(200);
    expect(startRes.body.success).toBe(true);
    expect(startRes.body.data.status).toBe('IN_PROGRESS');

    // Verify DB state
    const inProgressDb = await prisma.consultation.findUnique({
      where: { id: consultation.id }
    });
    expect(inProgressDb.status).toBe('IN_PROGRESS');
    expect(inProgressDb.startedAt).not.toBeNull();

    // Verify Audit log in DB
    const startAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'CONSULTATION_STARTED',
        entityId: consultation.id
      }
    });
    expect(startAudit).not.toBeNull();
    expect(startAudit.actorId).toBe(doctorUser.id);

    // 2. Starting again is rejected with 409 Conflict
    const repeatStartRes = await request(app)
      .post(`/api/v1/consultations/${consultation.id}/start`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(repeatStartRes.status).toBe(409);
    expect(repeatStartRes.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    // 3. Doctor issues a prescription while IN_PROGRESS
    const prescriptionPayload = {
      medicines: [
        {
          name: 'Brahmi Vati',
          dosage: '1 tablet (250mg)',
          frequency: 'Twice daily with water',
          duration: '14 days'
        }
      ],
      dosageInstructions: 'Take after meals',
      advice: 'Ensure adequate hydration and regular sleep.'
    };

    const rxRes = await request(app)
      .post(`/api/v1/consultations/${consultation.id}/prescriptions`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send(prescriptionPayload);

    expect(rxRes.status).toBe(201);
    expect(rxRes.body.success).toBe(true);
    expect(rxRes.body.data.consultationId).toBe(consultation.id);

    // Verify prescription audit log
    const rxAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'PRESCRIPTION_CREATED',
        entityId: rxRes.body.data.id
      }
    });
    expect(rxAudit).not.toBeNull();
    expect(rxAudit.actorId).toBe(doctorUser.id);

    // 4. Doctor completes the consultation
    const completeRes = await request(app)
      .post(`/api/v1/consultations/${consultation.id}/complete`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ notes: 'Follow-up in 2 weeks recommended.' });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.success).toBe(true);
    expect(completeRes.body.data.status).toBe('COMPLETED');

    // Verify DB state
    const completedDb = await prisma.consultation.findUnique({
      where: { id: consultation.id }
    });
    expect(completedDb.status).toBe('COMPLETED');
    expect(completedDb.completedAt).not.toBeNull();
    expect(completedDb.notes).toBe('Follow-up in 2 weeks recommended.');

    // Verify complete audit log
    const completeAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'CONSULTATION_COMPLETED',
        entityId: consultation.id
      }
    });
    expect(completeAudit).not.toBeNull();

    // 5. Patient retrieves their completed consultation and prescription
    const getConsultationRes = await request(app)
      .get(`/api/v1/consultations/${consultation.id}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(getConsultationRes.status).toBe(200);
    expect(getConsultationRes.body.data.status).toBe('COMPLETED');
    expect(getConsultationRes.body.data.prescriptions).toHaveLength(1);

    const getPrescriptionsRes = await request(app)
      .get(`/api/v1/consultations/${consultation.id}/prescriptions`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(getPrescriptionsRes.status).toBe(200);
    expect(getPrescriptionsRes.body.data).toHaveLength(1);
  });
});
