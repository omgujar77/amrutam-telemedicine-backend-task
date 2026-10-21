import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

vi.spyOn(prisma.user, 'findUnique');
vi.spyOn(prisma.doctorProfile, 'findUnique');
vi.spyOn(prisma.doctorProfile, 'update');
vi.spyOn(prisma.doctorProfile, 'count');
vi.spyOn(prisma.user, 'count');
vi.spyOn(prisma.userMfa, 'count');
vi.spyOn(prisma.consultation, 'count');
vi.spyOn(prisma.consultation, 'groupBy');
vi.spyOn(prisma.prescription, 'count');
vi.spyOn(prisma.auditLog, 'count');
vi.spyOn(prisma.auditLog, 'findMany');
vi.spyOn(prisma.auditLog, 'create');
vi.spyOn(prisma, '$transaction');

describe('Admin Module & Privileged MFA Enforcement (Phase 7)', () => {
  const adminUser = { id: 'admin-uuid-1', role: 'ADMIN', email: 'admin@amrutam.local', status: 'ACTIVE', name: 'Admin' };
  const doctorUser = { id: 'doc-uuid-1', role: 'DOCTOR', email: 'doc@amrutam.local', status: 'ACTIVE', name: 'Dr. Sharma' };
  const patientUser = { id: 'patient-uuid-1', role: 'PATIENT', email: 'patient@amrutam.local', status: 'ACTIVE', name: 'Patient' };

  // Tokens with and without MFA verified
  const unverifiedAdminToken = tokenService.generateAccessToken(adminUser, { mfaVerified: false });
  const verifiedAdminToken = tokenService.generateAccessToken(adminUser, { mfaVerified: true });
  const doctorToken = tokenService.generateAccessToken(doctorUser, { mfaVerified: true });
  const patientToken = tokenService.generateAccessToken(patientUser, { mfaVerified: false });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockImplementation(async ({ where }) => {
      if (where.id === adminUser.id) return adminUser;
      if (where.id === doctorUser.id) return doctorUser;
      if (where.id === patientUser.id) return patientUser;
      return null;
    });
  });

  describe('Route Protection & MFA Gatekeeper', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .post('/api/v1/admin/doctors/doc-1/verify')
        .send({ verificationStatus: 'VERIFIED' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects PATIENT requests with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/admin/doctors/doc-1/verify')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ verificationStatus: 'VERIFIED' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects DOCTOR requests with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/admin/doctors/doc-1/verify')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ verificationStatus: 'VERIFIED' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects ADMIN without MFA verification with 403 MFA_REQUIRED', async () => {
      const res = await request(app)
        .post('/api/v1/admin/doctors/doc-1/verify')
        .set('Authorization', `Bearer ${unverifiedAdminToken}`)
        .send({ verificationStatus: 'VERIFIED' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('MFA_REQUIRED');
      expect(res.body.error.message).toContain('Multi-factor authentication');
    });
  });

  describe('POST /api/v1/admin/doctors/:doctorId/verify', () => {
    it('allows MFA-verified ADMIN to approve a doctor', async () => {
      const mockDoctor = {
        id: 'doc-profile-1',
        verificationStatus: 'PENDING',
        user: { id: 'u-1', name: 'Dr. Sharma', email: 'sharma@amrutam.local' }
      };

      prisma.doctorProfile.findUnique.mockResolvedValueOnce(mockDoctor);

      prisma.$transaction.mockImplementationOnce(async (callback) => {
        const tx = {
          doctorProfile: {
            update: vi.fn().mockResolvedValue({ ...mockDoctor, verificationStatus: 'VERIFIED' })
          },
          auditLog: { create: vi.fn().mockResolvedValue({}) }
        };
        return callback(tx);
      });

      const res = await request(app)
        .post('/api/v1/admin/doctors/doc-profile-1/verify')
        .set('Authorization', `Bearer ${verifiedAdminToken}`)
        .send({ verificationStatus: 'VERIFIED' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verificationStatus).toBe('VERIFIED');
    });

    it('validates request payload strictly (rejects invalid status)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/doctors/doc-profile-1/verify')
        .set('Authorization', `Bearer ${verifiedAdminToken}`)
        .send({ verificationStatus: 'MAYBE' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/admin/audit-logs', () => {
    it('enforces MFA on audit log inspection', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${unverifiedAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('MFA_REQUIRED');
    });

    it('returns paginated audit logs for MFA-verified admin', async () => {
      prisma.auditLog.count.mockResolvedValueOnce(2);
      prisma.auditLog.findMany.mockResolvedValueOnce([
        {
          id: 'log-1',
          action: 'DOCTOR_VERIFIED',
          entityType: 'DoctorProfile',
          entityId: 'doc-profile-1',
          createdAt: new Date(),
          actor: { id: adminUser.id, name: 'Admin', email: adminUser.email, role: 'ADMIN' }
        }
      ]);

      const res = await request(app)
        .get('/api/v1/admin/audit-logs?page=1&pageSize=10')
        .set('Authorization', `Bearer ${verifiedAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBe(2);
    });
  });

  describe('GET /api/v1/admin/overview', () => {
    it('returns system security and platform metrics for verified admin', async () => {
      prisma.user.count.mockResolvedValueOnce(15);
      prisma.userMfa.count.mockResolvedValueOnce(4);
      prisma.doctorProfile.count.mockResolvedValueOnce(2);
      prisma.consultation.count.mockResolvedValueOnce(28);

      const res = await request(app)
        .get('/api/v1/admin/overview')
        .set('Authorization', `Bearer ${verifiedAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalUsers).toBe(15);
      expect(res.body.data.totalMfaEnabled).toBe(4);
      expect(res.body.data.pendingDoctors).toBe(2);
      expect(res.body.data.totalConsultations).toBe(28);
    });
  });

  describe('GET /api/v1/admin/analytics/overview (Phase 8)', () => {
    it('enforces MFA on analytics overview (403 if unverified)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/overview')
        .set('Authorization', `Bearer ${unverifiedAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('MFA_REQUIRED');
    });

    it('denies non-admin roles (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics/overview')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns privacy-safe aggregate analytics for verified admin with default 30d window', async () => {
      // Mock all counts in Promise.all order
      prisma.user.count.mockResolvedValueOnce(50); // totalPatients
      prisma.doctorProfile.count
        .mockResolvedValueOnce(10) // totalDoctors
        .mockResolvedValueOnce(7)  // verifiedDoctors
        .mockResolvedValueOnce(2)  // pendingDoctors
        .mockResolvedValueOnce(1); // rejectedDoctors
      prisma.consultation.count
        .mockResolvedValueOnce(40) // totalConsultations
        .mockResolvedValueOnce(15) // consultationsCreatedInWindow
        .mockResolvedValueOnce(12); // consultationsCompletedInWindow
      prisma.consultation.groupBy.mockResolvedValueOnce([
        { status: 'SCHEDULED', _count: { id: 8 } },
        { status: 'IN_PROGRESS', _count: { id: 2 } },
        { status: 'COMPLETED', _count: { id: 25 } },
        { status: 'CANCELLED', _count: { id: 5 } }
      ]);
      prisma.prescription.count
        .mockResolvedValueOnce(30) // totalPrescriptions
        .mockResolvedValueOnce(10); // prescriptionsCreatedInWindow

      const res = await request(app)
        .get('/api/v1/admin/analytics/overview?window=30d')
        .set('Authorization', `Bearer ${verifiedAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      // Check structure
      expect(res.body.data.timeWindow.window).toBe('30d');
      expect(res.body.data.users.totalPatients).toBe(50);
      expect(res.body.data.users.totalDoctors).toBe(10);
      expect(res.body.data.users.verifiedDoctors).toBe(7);
      expect(res.body.data.consultations.total).toBe(40);
      expect(res.body.data.consultations.byStatus.COMPLETED).toBe(25);
      expect(res.body.data.consultations.byStatus.SCHEDULED).toBe(8);
      expect(res.body.data.consultations.createdInWindow).toBe(15);
      expect(res.body.data.prescriptions.total).toBe(30);

      // Verify privacy: NO raw rows or personal data returned
      expect(res.body.data.patients).toBeUndefined();
      expect(res.body.data.doctors).toBeUndefined();
      expect(res.body.data.rawRecords).toBeUndefined();
    });

    it('supports custom window parameters (e.g. 7d)', async () => {
      prisma.user.count.mockResolvedValueOnce(10);
      prisma.doctorProfile.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);
      prisma.consultation.count
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(3);
      prisma.consultation.groupBy.mockResolvedValueOnce([]);
      prisma.prescription.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);

      const res = await request(app)
        .get('/api/v1/admin/analytics/overview?window=7d')
        .set('Authorization', `Bearer ${verifiedAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.timeWindow.window).toBe('7d');
    });
  });
});
