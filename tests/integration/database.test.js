import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { checkDatabaseConnection } from '../../src/config/database.js';

describe('PostgreSQL & Prisma Schema Integration Tests (Phase 2)', () => {
  let prisma;
  let isDbAvailable = false;
  const testRunId = Date.now().toString(36);

  beforeAll(async () => {
    const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    prisma = new PrismaClient({
      datasources: {
        db: { url: testDbUrl }
      }
    });

    const check = await checkDatabaseConnection(5000);
    isDbAvailable = check.isReady;
    if (!isDbAvailable) {
      console.warn('⚠️  PostgreSQL is not currently reachable. Live database constraint tests will be conditional.');
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('Prisma Client is properly generated with all schema models', () => {
    expect(prisma.user).toBeDefined();
    expect(prisma.patientProfile).toBeDefined();
    expect(prisma.doctorProfile).toBeDefined();
    expect(prisma.availabilitySlot).toBeDefined();
    expect(prisma.consultation).toBeDefined();
    expect(prisma.prescription).toBeDefined();
    expect(prisma.payment).toBeDefined();
    expect(prisma.auditLog).toBeDefined();
    expect(prisma.refreshSession).toBeDefined();
  });

  it('Prisma Client exposes model query operations', () => {
    expect(typeof prisma.user.create).toBe('function');
    expect(typeof prisma.user.findUnique).toBe('function');
    expect(typeof prisma.availabilitySlot.create).toBe('function');
    expect(typeof prisma.consultation.create).toBe('function');
    expect(typeof prisma.payment.create).toBe('function');
  });

  describe('Live Database CRUD & Constraints (Executed when PostgreSQL is connected)', () => {
    it('creates a user and enforces email uniqueness constraint', async ({ skip }) => {
      if (!isDbAvailable) return skip();

      const testEmail = `test.patient.${testRunId}@amrutam.local`;

      // 1. Create first user
      const user1 = await prisma.user.create({
        data: {
          email: testEmail,
          passwordHash: 'dummy-hashed-password-for-integration-test',
          name: 'Integration Test Patient',
          role: 'PATIENT'
        }
      });
      expect(user1.id).toBeDefined();
      expect(user1.email).toBe(testEmail);

      // 2. Attempt duplicate creation -> must fail with P2002
      await expect(
        prisma.user.create({
          data: {
            email: testEmail,
            passwordHash: 'dummy-hashed-password-2',
            name: 'Duplicate Patient',
            role: 'PATIENT'
          }
        })
      ).rejects.toThrow();

      // Clean up
      await prisma.user.delete({ where: { id: user1.id } });
    });

    it('creates doctor profile and persists availability slot', async ({ skip }) => {
      if (!isDbAvailable) return skip();

      const doctorEmail = `dr.test.${testRunId}@amrutam.local`;
      const user = await prisma.user.create({
        data: {
          email: doctorEmail,
          passwordHash: 'dummy-hash',
          name: 'Dr. Integration Test',
          role: 'DOCTOR',
          doctorProfile: {
            create: {
              qualifications: 'BAMS',
              specialization: 'Ayurveda',
              consultationFee: 500.00,
              verificationStatus: 'VERIFIED'
            }
          }
        },
        include: { doctorProfile: true }
      });

      const doctorId = user.doctorProfile.id;
      const startTime = new Date(Date.now() + 100000);
      const endTime = new Date(Date.now() + 101800);

      const slot = await prisma.availabilitySlot.create({
        data: {
          doctorId,
          startTime,
          endTime,
          status: 'AVAILABLE'
        }
      });
      expect(slot.id).toBeDefined();
      expect(slot.status).toBe('AVAILABLE');

      // Attempt duplicate slot for exact same doctor and times -> must fail
      await expect(
        prisma.availabilitySlot.create({
          data: {
            doctorId,
            startTime,
            endTime,
            status: 'AVAILABLE'
          }
        })
      ).rejects.toThrow();

      // Clean up (Cascade removes doctorProfile)
      await prisma.availabilitySlot.delete({ where: { id: slot.id } });
      await prisma.user.delete({ where: { id: user.id } });
    });

    it('persists payment with Decimal precision and consultation foreign key', async ({ skip }) => {
      if (!isDbAvailable) return skip();

      // Setup patient and doctor
      const patientUser = await prisma.user.create({
        data: {
          email: `patient.pay.${testRunId}@amrutam.local`,
          passwordHash: 'hash',
          name: 'Paying Patient',
          role: 'PATIENT',
          patientProfile: { create: {} }
        },
        include: { patientProfile: true }
      });

      const doctorUser = await prisma.user.create({
        data: {
          email: `doc.pay.${testRunId}@amrutam.local`,
          passwordHash: 'hash',
          name: 'Doctor Payee',
          role: 'DOCTOR',
          doctorProfile: {
            create: {
              qualifications: 'MD Ayurveda',
              specialization: 'General',
              consultationFee: 1250.75
            }
          }
        },
        include: { doctorProfile: true }
      });

      const slot = await prisma.availabilitySlot.create({
        data: {
          doctorId: doctorUser.doctorProfile.id,
          startTime: new Date(Date.now() + 200000),
          endTime: new Date(Date.now() + 201800)
        }
      });

      const consultation = await prisma.consultation.create({
        data: {
          patientId: patientUser.patientProfile.id,
          doctorId: doctorUser.doctorProfile.id,
          slotId: slot.id,
          scheduledAt: slot.startTime,
          status: 'SCHEDULED'
        }
      });

      const payment = await prisma.payment.create({
        data: {
          consultationId: consultation.id,
          amount: 1250.75,
          currency: 'INR',
          status: 'COMPLETED',
          providerReference: `PAY_REF_${testRunId}`
        }
      });

      expect(payment.amount.toString()).toBe('1250.75');
      expect(payment.currency).toBe('INR');
      expect(payment.status).toBe('COMPLETED');

      // Clean up
      await prisma.payment.delete({ where: { id: payment.id } });
      await prisma.consultation.delete({ where: { id: consultation.id } });
      await prisma.availabilitySlot.delete({ where: { id: slot.id } });
      await prisma.user.delete({ where: { id: patientUser.id } });
      await prisma.user.delete({ where: { id: doctorUser.id } });
    });
  });
});
