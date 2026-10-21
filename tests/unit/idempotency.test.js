import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { bookingService } from '../../src/modules/bookings/booking.service.js';
import { AppError } from '../../src/common/errors/AppError.js';

vi.spyOn(prisma.idempotencyRecord, 'findUnique');
vi.spyOn(prisma, '$transaction');

describe('Idempotency Request Fingerprint & Replay Rules (Phase 9 / Section 6)', () => {
  const userIdA = 'patient-user-a';
  const userIdB = 'patient-user-b';
  const slotId1 = 'slot-1';
  const slotId2 = 'slot-2';
  const commonKey = 'client-idempotency-key-001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Header & Key Format Validation', () => {
    it('throws 400 IDEMPOTENCY_KEY_REQUIRED if key is missing or undefined', async () => {
      await expect(
        bookingService.createBooking(userIdA, { slotId: slotId1 }, undefined)
      ).rejects.toThrow('Idempotency-Key header is required');

      await expect(
        bookingService.createBooking(userIdA, { slotId: slotId1 }, null)
      ).rejects.toThrow('Idempotency-Key header is required');
    });

    it('throws 400 INVALID_IDEMPOTENCY_KEY if key is empty or whitespace-only', async () => {
      await expect(
        bookingService.createBooking(userIdA, { slotId: slotId1 }, '   ')
      ).rejects.toThrow('Idempotency-Key must be between 1 and 128 characters');
    });

    it('throws 400 INVALID_IDEMPOTENCY_KEY if key exceeds 128 characters', async () => {
      const longKey = 'a'.repeat(129);
      await expect(
        bookingService.createBooking(userIdA, { slotId: slotId1 }, longKey)
      ).rejects.toThrow('Idempotency-Key must be between 1 and 128 characters');
    });
  });

  describe('Deterministic Fingerprint & Replay Behavior', () => {
    it('computes deterministic SHA-256 fingerprint from payload', () => {
      const hash1 = bookingService.generateRequestHash({ slotId: slotId1 });
      const hash2 = bookingService.generateRequestHash({ slotId: slotId1 });
      const hashDiff = bookingService.generateRequestHash({ slotId: slotId2 });

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string
      expect(hash1).not.toBe(hashDiff);
    });

    it('returns original consultation with isReplay: true when key and fingerprint match existing record', async () => {
      const existingConsultation = {
        id: 'consultation-original-1',
        patientId: 'patient-p-1',
        doctorId: 'doctor-p-1',
        slotId: slotId1,
        status: 'SCHEDULED'
      };

      const expectedHash = bookingService.generateRequestHash({ slotId: slotId1 });

      prisma.idempotencyRecord.findUnique.mockResolvedValueOnce({
        id: 'idem-rec-1',
        userId: userIdA,
        operation: 'booking:create',
        idempotencyKey: commonKey,
        requestHash: expectedHash,
        resourceId: existingConsultation.id,
        responseBody: existingConsultation
      });

      const result = await bookingService.createBooking(userIdA, { slotId: slotId1 }, commonKey);

      expect(result.isReplay).toBe(true);
      expect(result.booking.id).toBe(existingConsultation.id);
      // Prisma transaction should NOT be invoked for replay
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 409 IDEMPOTENCY_KEY_MISMATCH when reusing the same key with a different request payload', async () => {
      const originalHashForSlot1 = bookingService.generateRequestHash({ slotId: slotId1 });

      prisma.idempotencyRecord.findUnique.mockResolvedValueOnce({
        id: 'idem-rec-1',
        userId: userIdA,
        operation: 'booking:create',
        idempotencyKey: commonKey,
        requestHash: originalHashForSlot1,
        resourceId: 'consultation-1',
        responseBody: {}
      });

      // User tries to use the same key for slotId2
      await expect(
        bookingService.createBooking(userIdA, { slotId: slotId2 }, commonKey)
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'IDEMPOTENCY_KEY_MISMATCH'
      });
    });
  });

  describe('Per-User Scoped Key Isolation', () => {
    it('scopes idempotency keys per user so different patients using the same textual key do not collide', async () => {
      // User A check queries with userIdA
      prisma.idempotencyRecord.findUnique.mockImplementation(async ({ where }) => {
        const unique = where.unique_user_operation_idempotency;
        if (unique.userId === userIdA && unique.idempotencyKey === commonKey) {
          return {
            id: 'idem-user-a',
            userId: userIdA,
            operation: 'booking:create',
            idempotencyKey: commonKey,
            requestHash: bookingService.generateRequestHash({ slotId: slotId1 }),
            resourceId: 'booking-a',
            responseBody: { id: 'booking-a' }
          };
        }
        // User B has not used this key yet
        return null;
      });

      // User A call gets replay of booking-a
      const resultA = await bookingService.createBooking(userIdA, { slotId: slotId1 }, commonKey);
      expect(resultA.isReplay).toBe(true);
      expect(resultA.booking.id).toBe('booking-a');

      // User B call initiates fresh booking creation
      prisma.$transaction.mockImplementationOnce(async (callback) => {
        const tx = {
          patientProfile: {
            findUnique: vi.fn().mockResolvedValue({ id: 'patient-b-profile', userId: userIdB })
          },
          availabilitySlot: {
            findUnique: vi.fn().mockResolvedValue({
              id: slotId2,
              doctorId: 'doc-1',
              startTime: new Date('2026-11-25T11:00:00.000Z'),
              status: 'AVAILABLE'
            }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 })
          },
          consultation: {
            create: vi.fn().mockResolvedValue({
              id: 'booking-b',
              patientId: 'patient-b-profile',
              doctorId: 'doc-1',
              slotId: slotId2,
              status: 'SCHEDULED'
            })
          },
          idempotencyRecord: {
            create: vi.fn().mockResolvedValue({ id: 'idem-user-b' })
          }
        };
        return callback(tx);
      });

      const resultB = await bookingService.createBooking(userIdB, { slotId: slotId2 }, commonKey);
      expect(resultB.isReplay).toBe(false);
      expect(resultB.booking.id).toBe('booking-b');
    });
  });
});
