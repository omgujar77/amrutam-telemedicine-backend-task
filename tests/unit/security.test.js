import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { tokenService } from '../../src/modules/auth/token.service.js';
import { redactPaths } from '../../src/common/logger/logger.js';

vi.spyOn(prisma.user, 'findUnique');
vi.spyOn(prisma.patientProfile, 'findUnique');
vi.spyOn(prisma.doctorProfile, 'findUnique');
vi.spyOn(prisma.consultation, 'findUnique');
vi.spyOn(prisma.prescription, 'findUnique');

describe('Security Hardening & IDOR Authorization Boundaries (Phase 7)', () => {
  const patientOne = { id: 'patient-uuid-1', role: 'PATIENT', email: 'patient1@amrutam.local', status: 'ACTIVE', name: 'Patient One' };
  const patientTwo = { id: 'patient-uuid-2', role: 'PATIENT', email: 'patient2@amrutam.local', status: 'ACTIVE', name: 'Patient Two' };
  const doctorOne = { id: 'doc-user-1', role: 'DOCTOR', email: 'doc1@amrutam.local', status: 'ACTIVE', name: 'Dr. One' };
  const doctorTwo = { id: 'doc-user-2', role: 'DOCTOR', email: 'doc2@amrutam.local', status: 'ACTIVE', name: 'Dr. Two' };

  const patientOneToken = tokenService.generateAccessToken(patientOne);
  const patientTwoToken = tokenService.generateAccessToken(patientTwo);
  const doctorTwoToken = tokenService.generateAccessToken(doctorTwo);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Sensitive Log Redaction Configuration', () => {
    it('contains comprehensive redaction paths for passwords, tokens, and MFA secrets', () => {
      expect(redactPaths).toBeDefined();
      expect(redactPaths).toContain('password');
      expect(redactPaths).toContain('*.password');
      expect(redactPaths).toContain('mfaSecret');
      expect(redactPaths).toContain('totpCode');
      expect(redactPaths).toContain('tempToken');
      expect(redactPaths).toContain('accessToken');
      expect(redactPaths).toContain('refreshToken');
      expect(redactPaths).toContain('req.headers.authorization');
      expect(redactPaths).toContain('req.headers.cookie');
    });
  });

  describe('Resource Ownership & IDOR Protection', () => {
    it('prevents Patient Two from accessing Patient One consultation (IDOR check)', async () => {
      // Mock authenticate user lookup
      prisma.user.findUnique.mockResolvedValueOnce(patientTwo);

      // Mock consultation belonging to patientOne and doctorOne
      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-100',
        bookingId: 'booking-1',
        patientId: 'profile-patient-1',
        doctorId: 'profile-doc-1',
        status: 'SCHEDULED',
        patient: { userId: patientOne.id },
        doctor: { userId: doctorOne.id },
        booking: { id: 'booking-1' }
      });

      const res = await request(app)
        .get('/api/v1/consultations/consultation-100')
        .set('Authorization', `Bearer ${patientTwoToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('permission');
    });

    it('prevents an unrelated Doctor Two from accessing Doctor One consultation', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorTwo);

      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-100',
        bookingId: 'booking-1',
        patientId: 'profile-patient-1',
        doctorId: 'profile-doc-1',
        status: 'SCHEDULED',
        patient: { userId: patientOne.id },
        doctor: { userId: doctorOne.id },
        booking: { id: 'booking-1' }
      });

      const res = await request(app)
        .get('/api/v1/consultations/consultation-100')
        .set('Authorization', `Bearer ${doctorTwoToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('prevents Doctor Two from issuing a prescription for Doctor One consultation', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorTwo);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: 'profile-doc-2',
        userId: doctorTwo.id
      });

      prisma.consultation.findUnique.mockResolvedValueOnce({
        id: 'consultation-100',
        bookingId: 'booking-1',
        patientId: 'profile-patient-1',
        doctorId: 'profile-doc-1', // belongs to doctor 1
        status: 'IN_PROGRESS',
        patient: { userId: patientOne.id },
        doctor: { id: 'profile-doc-1', userId: doctorOne.id }
      });

      const res = await request(app)
        .post('/api/v1/consultations/consultation-100/prescriptions')
        .set('Authorization', `Bearer ${doctorTwoToken}`)
        .send({
          medicines: [
            {
              name: 'Ashwagandha Churna',
              dosage: '500mg',
              frequency: 'Twice daily',
              duration: '14 days'
            }
          ],
          dosageInstructions: 'Take 1 spoon twice daily with warm milk'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Client-Supplied Override Immunity', () => {
    it('ignores client-supplied mfaVerified or role query/body injections', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientOne);

      // Patient attempts to supply ?mfaVerified=true or body { mfaVerified: true, role: 'ADMIN' }
      const res = await request(app)
        .get('/api/v1/admin/overview?mfaVerified=true')
        .set('Authorization', `Bearer ${patientOneToken}`)
        .send({ mfaVerified: true, role: 'ADMIN' });

      // Even if user attempts to inject role or mfaVerified, server authorization rejects with 403
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
