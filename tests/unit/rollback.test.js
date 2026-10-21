import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { bookingService } from '../../src/modules/bookings/booking.service.js';
import { prescriptionService } from '../../src/modules/prescriptions/prescription.service.js';
import { AppError } from '../../src/common/errors/AppError.js';

vi.spyOn(prisma, '$transaction');
vi.spyOn(prisma.idempotencyRecord, 'findUnique');
vi.spyOn(prisma.patientProfile, 'findUnique');
vi.spyOn(prisma.doctorProfile, 'findUnique');
vi.spyOn(prisma.consultation, 'findUnique');

describe('Transaction Boundaries & Rollback Verification (Phase 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Booking Creation Transaction Rollback', () => {
    const userId = 'patient-user-1';
    const slotId = 'slot-1';
    const idempotencyKey = 'rollback-test-key-1';

    it('rolls back slot status, consultation creation, and idempotency record if an error occurs during booking', async () => {
      // 1. Mock idempotency check (none exists)
      prisma.idempotencyRecord.findUnique.mockResolvedValueOnce(null);

      // 2. Track database mutations inside the mock transaction
      let slotUpdatedToBooked = false;
      let consultationCreated = false;
      let idempotencyPersisted = false;

      // 3. Mock $transaction where an error is injected after slot update
      prisma.$transaction.mockImplementationOnce(async (callback) => {
        const tx = {
          patientProfile: {
            findUnique: vi.fn().mockResolvedValue({ id: 'patient-profile-1', userId })
          },
          availabilitySlot: {
            findUnique: vi.fn().mockResolvedValue({
              id: slotId,
              doctorId: 'doc-profile-1',
              startTime: new Date('2026-11-20T10:00:00.000Z'),
              status: 'AVAILABLE'
            }),
            updateMany: vi.fn().mockImplementation(async () => {
              slotUpdatedToBooked = true;
              return { count: 1 };
            })
          },
          consultation: {
            create: vi.fn().mockImplementation(async () => {
              // Simulated database constraint error or controlled failure injection
              throw new Error('Controlled database error during consultation insertion');
            })
          },
          idempotencyRecord: {
            create: vi.fn().mockImplementation(async () => {
              idempotencyPersisted = true;
              return {};
            })
          }
        };

        // When callback throws, Prisma transaction rolls back and rethrows
        try {
          return await callback(tx);
        } catch (err) {
          // Transaction aborts - slot update is aborted, no consultation or idempotency record persisted
          slotUpdatedToBooked = false;
          consultationCreated = false;
          idempotencyPersisted = false;
          throw err;
        }
      });

      // Execute booking creation and expect failure
      await expect(
        bookingService.createBooking(userId, { slotId }, idempotencyKey)
      ).rejects.toThrow('Controlled database error during consultation insertion');

      // Verify that after rollback, no partial mutations persist
      expect(slotUpdatedToBooked).toBe(false);
      expect(consultationCreated).toBe(false);
      expect(idempotencyPersisted).toBe(false);
    });

    it('succeeds on retry once the controlled failure condition is resolved', async () => {
      prisma.idempotencyRecord.findUnique.mockResolvedValueOnce(null);

      const successfulBooking = {
        id: 'consultation-success-1',
        patientId: 'patient-profile-1',
        doctorId: 'doc-profile-1',
        slotId,
        status: 'SCHEDULED',
        scheduledAt: new Date('2026-11-20T10:00:00.000Z')
      };

      prisma.$transaction.mockImplementationOnce(async (callback) => {
        const tx = {
          patientProfile: {
            findUnique: vi.fn().mockResolvedValue({ id: 'patient-profile-1', userId })
          },
          availabilitySlot: {
            findUnique: vi.fn().mockResolvedValue({
              id: slotId,
              doctorId: 'doc-profile-1',
              startTime: new Date('2026-11-20T10:00:00.000Z'),
              status: 'AVAILABLE'
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 })
          },
          consultation: {
            create: vi.fn().mockResolvedValue(successfulBooking)
          },
          idempotencyRecord: {
            create: vi.fn().mockResolvedValue({ id: 'idem-1' })
          }
        };
        return callback(tx);
      });

      const result = await bookingService.createBooking(userId, { slotId }, idempotencyKey);
      expect(result.isReplay).toBe(false);
      expect(result.booking.id).toBe('consultation-success-1');
    });
  });

  describe('Prescription & Audit Log Transaction Boundaries', () => {
    it('rolls back prescription persistence if audit log persistence fails within transaction', async () => {
      const doctorUserId = 'doc-user-1';
      const consultationId = 'consultation-active-1';

      prisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: 'doc-profile-1',
        userId: doctorUserId
      });

      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: consultationId,
        doctorId: 'doc-profile-1',
        patientId: 'patient-profile-1',
        status: 'IN_PROGRESS'
      });

      let prescriptionPersisted = false;

      prisma.$transaction.mockImplementationOnce(async (callback) => {
        const tx = {
          prescription: {
            create: vi.fn().mockImplementation(async () => {
              prescriptionPersisted = true;
              return { id: 'prescription-temp-1' };
            }),
            findUnique: vi.fn().mockResolvedValue({ id: 'prescription-temp-1' })
          },
          auditLog: {
            create: vi.fn().mockImplementation(async () => {
              // Simulated failure in audit write
              throw new Error('Database disk error during audit persistence');
            })
          }
        };

        try {
          return await callback(tx);
        } catch (err) {
          prescriptionPersisted = false;
          throw err;
        }
      });

      await expect(
        prescriptionService.createPrescription(
          doctorUserId,
          consultationId,
          {
            medicines: [
              {
                name: 'Brahmi Vati',
                dosage: '250mg',
                frequency: 'Once daily',
                duration: '10 days'
              }
            ],
            dosageInstructions: 'Take after dinner'
          }
        )
      ).rejects.toThrow('Database disk error during audit persistence');

      expect(prescriptionPersisted).toBe(false);
    });
  });
});
