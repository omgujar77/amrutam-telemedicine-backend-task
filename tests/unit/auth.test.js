import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

// Spy on prisma
vi.spyOn(prisma.user, 'findUnique');
vi.spyOn(prisma.user, 'create');
vi.spyOn(prisma.refreshSession, 'create');
vi.spyOn(prisma.refreshSession, 'findUnique');
vi.spyOn(prisma.refreshSession, 'update');
vi.spyOn(prisma.refreshSession, 'updateMany');
vi.spyOn(prisma, '$transaction');

describe('Authentication & Access Control (Phase 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/auth/register', () => {
    const validRegisterPayload = {
      name: 'Test Patient',
      email: 'newpatient@amrutam.local',
      password: 'StrongPassword123!'
    };

    it('successfully registers a patient and returns tokens without passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      const mockCreatedUser = {
        id: 'patient-uuid-1',
        name: 'Test Patient',
        email: 'newpatient@amrutam.local',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=1$fakehash',
        role: 'PATIENT',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        patientProfile: {
          id: 'profile-uuid-1',
          userId: 'patient-uuid-1'
        }
      };

      prisma.$transaction.mockImplementationOnce(async (callback) => {
        const tx = {
          user: { create: vi.fn().mockResolvedValue(mockCreatedUser) },
          refreshSession: { create: vi.fn().mockResolvedValue({}) }
        };
        return callback(tx);
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(validRegisterPayload);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.id).toBe('patient-uuid-1');
      expect(response.body.data.user.role).toBe('PATIENT');
      expect(response.body.data.accessToken).toBeDefined();
      // Ensure passwordHash is strictly excluded
      expect(response.body.data.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      // Ensure refresh token cookie is set
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('refreshToken=');
      expect(cookies[0]).toContain('HttpOnly');
    });

    it('rejects duplicate email with HTTP 409 Conflict', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'existing-id',
        email: 'newpatient@amrutam.local'
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(validRegisterPayload);

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('rejects registration with invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...validRegisterPayload,
          email: 'not-an-email'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects weak password that violates policy', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...validRegisterPayload,
          password: 'weak'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects attempted ADMIN or DOCTOR role injection', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...validRegisterPayload,
          role: 'ADMIN'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toMatch(/Unrecognized key|Unexpected field/i);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('authenticates valid credentials and returns access token & cookie', async () => {
      const hashedPassword = await argon2.hash('MyPassword123!', { type: argon2.argon2id });

      const mockUser = {
        id: 'user-login-uuid',
        name: 'Login User',
        email: 'user@amrutam.local',
        passwordHash: hashedPassword,
        role: 'PATIENT',
        status: 'ACTIVE',
        patientProfile: {},
        doctorProfile: null
      };

      prisma.user.findUnique.mockResolvedValueOnce(mockUser);
      prisma.refreshSession.create.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'user@amrutam.local',
          password: 'MyPassword123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe('user-login-uuid');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.user.passwordHash).toBeUndefined();
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('rejects invalid password with generic 401 error', async () => {
      const hashedPassword = await argon2.hash('CorrectPassword123!', { type: argon2.argon2id });

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-id',
        email: 'user@amrutam.local',
        passwordHash: hashedPassword,
        status: 'ACTIVE'
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'user@amrutam.local',
          password: 'WrongPassword123!'
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.error.message).toBe('Invalid email or password');
    });

    it('rejects nonexistent user with identical generic 401 error', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@amrutam.local',
          password: 'Password123!'
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.body.error.message).toBe('Invalid email or password');
    });

    it('rejects inactive or suspended accounts with 403 Forbidden', async () => {
      const hashedPassword = await argon2.hash('Password123!', { type: argon2.argon2id });

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'suspended-user',
        email: 'suspended@amrutam.local',
        passwordHash: hashedPassword,
        status: 'SUSPENDED'
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'suspended@amrutam.local',
          password: 'Password123!'
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('successfully rotates refresh token and returns new access token', async () => {
      const rawToken = 'sample-valid-refresh-token';
      const tokenHash = tokenService.hashRefreshToken(rawToken);

      const mockSession = {
        id: 'session-uuid-1',
        userId: 'user-uuid-1',
        tokenHash,
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: null,
        user: {
          id: 'user-uuid-1',
          email: 'user@amrutam.local',
          role: 'PATIENT',
          status: 'ACTIVE'
        }
      };

      prisma.refreshSession.findUnique.mockResolvedValueOnce(mockSession);
      prisma.$transaction.mockResolvedValueOnce([{}, {}]);

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${rawToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('detects refresh token reuse and revokes all user sessions', async () => {
      const rawToken = 'already-used-refresh-token';
      const tokenHash = tokenService.hashRefreshToken(rawToken);

      const mockReusedSession = {
        id: 'session-reused',
        userId: 'compromised-user-id',
        tokenHash,
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: new Date(Date.now() - 10000), // already revoked!
        user: { id: 'compromised-user-id', status: 'ACTIVE' }
      };

      prisma.refreshSession.findUnique.mockResolvedValueOnce(mockReusedSession);
      prisma.refreshSession.updateMany.mockResolvedValueOnce({ count: 2 });

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${rawToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_REUSED');
      expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'compromised-user-id', revokedAt: null },
        data: { revokedAt: expect.any(Date) }
      });
    });

    it('rejects expired refresh token with 401', async () => {
      const rawToken = 'expired-refresh-token';
      const tokenHash = tokenService.hashRefreshToken(rawToken);

      const mockExpiredSession = {
        id: 'session-expired',
        userId: 'user-id',
        tokenHash,
        expiresAt: new Date(Date.now() - 5000), // expired in past
        revokedAt: null,
        user: { id: 'user-id', status: 'ACTIVE' }
      };

      prisma.refreshSession.findUnique.mockResolvedValueOnce(mockExpiredSession);

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${rawToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes session in database and clears cookie', async () => {
      const rawToken = 'valid-logout-token';
      prisma.refreshSession.updateMany.mockResolvedValueOnce({ count: 1 });

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [`refreshToken=${rawToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.headers['set-cookie'][0]).toContain('refreshToken=;');
    });
  });
});
