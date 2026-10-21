import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

// Spy on prisma
vi.spyOn(prisma.user, 'findUnique');
vi.spyOn(prisma.user, 'update');
vi.spyOn(prisma.patientProfile, 'findUnique');
vi.spyOn(prisma.patientProfile, 'update');
vi.spyOn(prisma.doctorProfile, 'findUnique');
vi.spyOn(prisma.doctorProfile, 'update');

describe('User Profiles & Role-Based Access Control (RBAC) (Phase 3)', () => {
  const patientUser = {
    id: 'patient-id-123',
    email: 'patient@amrutam.local',
    name: 'Patient User',
    role: 'PATIENT',
    status: 'ACTIVE'
  };

  const doctorUser = {
    id: 'doctor-id-456',
    email: 'doctor@amrutam.local',
    name: 'Dr. Ayush',
    role: 'DOCTOR',
    status: 'ACTIVE'
  };

  let patientToken;
  let doctorToken;

  beforeEach(() => {
    vi.clearAllMocks();
    patientToken = tokenService.generateAccessToken(patientUser);
    doctorToken = tokenService.generateAccessToken(doctorUser);
  });

  describe('GET /api/v1/users/me', () => {
    it('returns the authenticated user profile without passwordHash', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(patientUser) // for authenticate middleware
        .mockResolvedValueOnce({
          ...patientUser,
          passwordHash: 'secret-hash',
          patientProfile: { bloodGroup: 'B+' }
        }); // for getMe service

      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(patientUser.id);
      expect(response.body.data.email).toBe(patientUser.email);
      expect(response.body.data.passwordHash).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('secret-hash');
    });

    it('rejects unauthenticated request with 401', async () => {
      const response = await request(app).get('/api/v1/users/me');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects invalid or forged JWT signature with 401', async () => {
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('PATCH /api/v1/users/me', () => {
    it('allows updating permitted fields such as name', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser); // authenticate
      prisma.user.update.mockResolvedValueOnce({
        ...patientUser,
        name: 'Updated Patient Name'
      });

      const response = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ name: 'Updated Patient Name' });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Updated Patient Name');
    });

    it('rejects attempts to modify role or account status', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);

      const response = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ role: 'ADMIN' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toMatch(/Unrecognized key|Modifying privileged fields/i);
    });
  });

  describe('RBAC: Patient Profile Endpoints', () => {
    it('allows PATIENT to access /me/patient-profile', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);
      prisma.patientProfile.findUnique.mockResolvedValueOnce({
        id: 'prof-1',
        userId: patientUser.id,
        bloodGroup: 'O+'
      });

      const response = await request(app)
        .get('/api/v1/users/me/patient-profile')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.bloodGroup).toBe('O+');
    });

    it('forbids DOCTOR from accessing /me/patient-profile with 403 Forbidden', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);

      const response = await request(app)
        .get('/api/v1/users/me/patient-profile')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('RBAC: Doctor Profile Endpoints', () => {
    it('allows DOCTOR to access /me/doctor-profile', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);
      prisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: 'doc-prof-1',
        userId: doctorUser.id,
        specialization: 'Ayurveda',
        verificationStatus: 'VERIFIED'
      });

      const response = await request(app)
        .get('/api/v1/users/me/doctor-profile')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.specialization).toBe('Ayurveda');
    });

    it('forbids PATIENT from accessing /me/doctor-profile with 403 Forbidden', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(patientUser);

      const response = await request(app)
        .get('/api/v1/users/me/doctor-profile')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('forbids DOCTOR from self-approving verificationStatus via profile update', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(doctorUser);

      const response = await request(app)
        .patch('/api/v1/users/me/doctor-profile')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ verificationStatus: 'VERIFIED' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toMatch(/Unrecognized key|Modifying verificationStatus/i);
    });
  });
});
