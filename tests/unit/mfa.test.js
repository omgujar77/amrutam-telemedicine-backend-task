import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import * as otplib from 'otplib';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { mfaService } from '../../src/modules/auth/mfa.service.js';
import { tokenService } from '../../src/modules/auth/token.service.js';
import { encryptionService } from '../../src/common/crypto/encryption.js';

vi.spyOn(prisma.user, 'findUnique');
vi.spyOn(prisma.userMfa, 'findUnique');
vi.spyOn(prisma.userMfa, 'upsert');
vi.spyOn(prisma.userMfa, 'update');
vi.spyOn(prisma.userMfa, 'delete');
vi.spyOn(prisma.auditLog, 'create');
vi.spyOn(prisma, '$transaction');

describe('MFA Service & TOTP Authentication (Phase 7)', () => {
  const adminUser = { id: 'admin-1', role: 'ADMIN', email: 'admin@amrutam.local', status: 'ACTIVE', name: 'Admin' };
  const doctorUser = { id: 'doc-1', role: 'DOCTOR', email: 'doc@amrutam.local', status: 'ACTIVE', name: 'Doctor' };
  const patientUser = { id: 'patient-1', role: 'PATIENT', email: 'pat@amrutam.local', status: 'ACTIVE', name: 'Patient' };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockImplementation(async ({ where }) => {
      if (where.id === adminUser.id) return adminUser;
      if (where.id === doctorUser.id) return doctorUser;
      if (where.id === patientUser.id) return patientUser;
      return null;
    });
  });

  describe('Encryption Utility (AES-256-GCM)', () => {
    it('encrypts and decrypts secret text correctly', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = encryptionService.encrypt(secret);
      expect(encrypted).not.toBe(secret);
      expect(encrypted.split(':')).toHaveLength(3); // iv:authTag:ciphertext

      const decrypted = encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('fails to decrypt if ciphertext is tampered', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = encryptionService.encrypt(secret);
      const parts = encrypted.split(':');
      parts[2] = 'tampered' + parts[2].substring(8);
      const tampered = parts.join(':');

      expect(() => encryptionService.decrypt(tampered)).toThrow();
    });
  });

  describe('mfaService.setupMfa', () => {
    it('blocks PATIENT role from enrolling in privileged MFA', async () => {
      await expect(mfaService.setupMfa(patientUser)).rejects.toThrow(/MFA enrollment is restricted to privileged roles/);
    });

    it('generates TOTP secret and uri for privileged ADMIN', async () => {
      prisma.userMfa.findUnique.mockResolvedValueOnce(null);
      prisma.userMfa.upsert.mockResolvedValueOnce({
        userId: adminUser.id,
        secretEncrypted: 'encrypted-secret',
        isEnabled: false
      });
      prisma.auditLog.create.mockResolvedValueOnce({});

      const result = await mfaService.setupMfa(adminUser);
      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('otpauthUri');
      expect(result.otpauthUri).toContain('otpauth://totp/');
      expect(result.otpauthUri).toContain('Amrutam');
      expect(prisma.userMfa.upsert).toHaveBeenCalledTimes(1);
    });

    it('generates TOTP secret for privileged DOCTOR', async () => {
      prisma.userMfa.findUnique.mockResolvedValueOnce(null);
      prisma.userMfa.upsert.mockResolvedValueOnce({
        userId: doctorUser.id,
        secretEncrypted: 'encrypted-secret',
        isEnabled: false
      });
      prisma.auditLog.create.mockResolvedValueOnce({});

      const result = await mfaService.setupMfa(doctorUser);
      expect(result).toHaveProperty('secret');
      expect(result.secret.length).toBeGreaterThan(10);
    });
  });

  describe('mfaService.verifyAndEnableMfa', () => {
    it('throws 400 when TOTP code is incorrect or invalid', async () => {
      const rawSecret = otplib.generateSecret();
      const secretEncrypted = encryptionService.encrypt(rawSecret);

      prisma.userMfa.findUnique.mockResolvedValueOnce({
        userId: adminUser.id,
        secretEncrypted,
        isEnabled: false
      });

      await expect(
        mfaService.verifyAndEnableMfa(adminUser, '000000')
      ).rejects.toThrow(/Invalid or expired MFA verification code/);
    });

    it('successfully verifies and enables MFA with valid TOTP code', async () => {
      const rawSecret = otplib.generateSecret();
      const secretEncrypted = encryptionService.encrypt(rawSecret);
      const validCode = otplib.generateSync({ secret: rawSecret });

      prisma.userMfa.findUnique.mockResolvedValueOnce({
        userId: adminUser.id,
        secretEncrypted,
        isEnabled: false
      });

      prisma.userMfa.update.mockResolvedValueOnce({
        userId: adminUser.id,
        isEnabled: true
      });
      prisma.auditLog.create.mockResolvedValueOnce({});

      const result = await mfaService.verifyAndEnableMfa(adminUser, validCode);
      expect(result).toHaveProperty('accessToken');
      expect(result.isMfaEnabled).toBe(true);

      const decoded = tokenService.verifyAccessToken(result.accessToken);
      expect(decoded.mfaVerified).toBe(true);
    });
  });

  describe('mfaService.verifyMfaChallenge', () => {
    it('rejects challenge if MFA is not enabled on account', async () => {
      prisma.userMfa.findUnique.mockResolvedValueOnce(null);

      await expect(
        mfaService.verifyMfaChallenge(adminUser, '123456')
      ).rejects.toThrow(/MFA is not enabled on this account/);
    });

    it('verifies valid code during login challenge and issues mfaVerified access token', async () => {
      const rawSecret = otplib.generateSecret();
      const secretEncrypted = encryptionService.encrypt(rawSecret);
      const validCode = otplib.generateSync({ secret: rawSecret });

      prisma.userMfa.findUnique.mockResolvedValueOnce({
        userId: adminUser.id,
        secretEncrypted,
        isEnabled: true
      });
      prisma.userMfa.update.mockResolvedValueOnce({});
      prisma.auditLog.create.mockResolvedValueOnce({});

      const result = await mfaService.verifyMfaChallenge(adminUser, validCode);
      expect(result).toHaveProperty('accessToken');
      const decoded = tokenService.verifyAccessToken(result.accessToken);
      expect(decoded.mfaVerified).toBe(true);
    });
  });

  describe('HTTP Endpoints & MFA Enforcement via Supertest', () => {
    it('POST /api/v1/auth/mfa/setup requires authentication', async () => {
      const res = await request(app).post('/api/v1/auth/mfa/setup');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('POST /api/v1/auth/mfa/verify validates 6-digit code format', async () => {
      const token = tokenService.generateAccessToken(adminUser);
      const res = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/auth/mfa/challenge verifies tempToken and issues verified access token', async () => {
      const rawSecret = otplib.generateSecret();
      const secretEncrypted = encryptionService.encrypt(rawSecret);
      const validCode = otplib.generateSync({ secret: rawSecret });

      const tempToken = tokenService.generateTempToken(adminUser);

      prisma.userMfa.findUnique.mockResolvedValueOnce({
        userId: adminUser.id,
        secretEncrypted,
        isEnabled: true
      });
      prisma.userMfa.update.mockResolvedValueOnce({});
      prisma.auditLog.create.mockResolvedValueOnce({});

      const res = await request(app)
        .post('/api/v1/auth/mfa/challenge')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({ code: validCode });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
    });
  });
});
