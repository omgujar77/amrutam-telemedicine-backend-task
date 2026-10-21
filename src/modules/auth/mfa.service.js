import * as otplib from 'otplib';
import { prisma } from '../../config/database.js';
import { encryptionService } from '../../common/crypto/encryption.js';
import { auditService } from '../../common/audit/audit.service.js';
import { tokenService } from './token.service.js';
import { AppError } from '../../common/errors/AppError.js';
import { logger } from '../../common/logger/logger.js';

function verifyTotpCode(secret, code) {
  try {
    const res = otplib.verifySync({ token: code, secret });
    return Boolean(res && (res === true || res.valid === true));
  } catch {
    return false;
  }
}

export const mfaService = {
  /**
   * Generates a TOTP secret and enrollment URI for privileged users.
   */
  async setupMfa(user) {
    // Only privileged roles (ADMIN, DOCTOR) can enroll in MFA
    if (user.role === 'PATIENT') {
      throw new AppError('MFA enrollment is restricted to privileged roles', 403, 'FORBIDDEN');
    }

    const existingMfa = await prisma.userMfa.findUnique({
      where: { userId: user.id }
    });

    if (existingMfa?.isEnabled) {
      throw new AppError('MFA is already enabled on this account', 409, 'MFA_ALREADY_ENABLED');
    }

    // Generate cryptographic base32 secret and standard otpauth URI
    const secret = otplib.generateSecret();
    const otpauthUri = otplib.generateURI({
      secret,
      label: user.email,
      issuer: 'Amrutam Telemedicine'
    });

    // Encrypt secret at rest via AES-256-GCM
    const secretEncrypted = encryptionService.encrypt(secret);

    await prisma.userMfa.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        isEnabled: false,
        secretEncrypted
      },
      update: {
        isEnabled: false,
        secretEncrypted,
        enrolledAt: null,
        lastVerifiedAt: null
      }
    });

    await auditService.log({
      actorId: user.id,
      action: 'MFA_SETUP_INITIATED',
      entityType: 'UserMfa',
      entityId: user.id,
      metadata: { role: user.role }
    });

    logger.info({ userId: user.id }, 'MFA setup initiated for privileged user');

    return {
      secret,
      otpauthUri
    };
  },

  /**
   * Verifies the initial TOTP code and activates MFA on the account.
   */
  async verifyAndEnableMfa(user, code, context = {}) {
    const cleanCode = String(code || '').trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      throw new AppError('Invalid MFA verification code format. Must be a 6-digit numeric string', 400, 'INVALID_MFA_CODE');
    }

    const userMfa = await prisma.userMfa.findUnique({
      where: { userId: user.id }
    });

    if (!userMfa) {
      throw new AppError('MFA setup must be initiated before verification', 400, 'MFA_NOT_INITIALIZED');
    }

    if (userMfa.isEnabled) {
      throw new AppError('MFA is already enabled on this account', 409, 'MFA_ALREADY_ENABLED');
    }

    const secret = encryptionService.decrypt(userMfa.secretEncrypted);
    const isValid = verifyTotpCode(secret, cleanCode);

    if (!isValid) {
      throw new AppError('Invalid or expired MFA verification code', 400, 'INVALID_MFA_CODE');
    }

    await prisma.userMfa.update({
      where: { userId: user.id },
      data: {
        isEnabled: true,
        enrolledAt: new Date(),
        lastVerifiedAt: new Date()
      }
    });

    await auditService.log({
      actorId: user.id,
      action: 'MFA_ENABLED',
      entityType: 'UserMfa',
      entityId: user.id,
      metadata: { role: user.role },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    logger.info({ userId: user.id }, 'MFA successfully enabled and verified');

    // Issue refreshed access token containing mfaVerified: true claim
    const accessToken = tokenService.generateAccessToken(user, { mfaVerified: true });

    return {
      isMfaEnabled: true,
      accessToken
    };
  },

  /**
   * Verifies a TOTP challenge during privileged login or step-up verification.
   */
  async verifyMfaChallenge(user, code, context = {}) {
    const cleanCode = String(code || '').trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      throw new AppError('Invalid MFA code format. Must be a 6-digit numeric string', 400, 'INVALID_MFA_CODE');
    }

    const userMfa = await prisma.userMfa.findUnique({
      where: { userId: user.id }
    });

    if (!userMfa || !userMfa.isEnabled) {
      throw new AppError('MFA is not enabled on this account', 400, 'MFA_NOT_ENABLED');
    }

    const secret = encryptionService.decrypt(userMfa.secretEncrypted);
    const isValid = verifyTotpCode(secret, cleanCode);

    if (!isValid) {
      throw new AppError('Invalid or expired MFA verification code', 400, 'INVALID_MFA_CODE');
    }

    await prisma.userMfa.update({
      where: { userId: user.id },
      data: { lastVerifiedAt: new Date() }
    });

    await auditService.log({
      actorId: user.id,
      action: 'MFA_VERIFIED',
      entityType: 'UserMfa',
      entityId: user.id,
      metadata: { role: user.role },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    const accessToken = tokenService.generateAccessToken(user, { mfaVerified: true });

    return {
      verified: true,
      accessToken
    };
  },

  /**
   * Disables MFA requiring a valid current TOTP code.
   */
  async disableMfa(user, code, context = {}) {
    const cleanCode = String(code || '').trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      throw new AppError('Invalid MFA code format', 400, 'INVALID_MFA_CODE');
    }

    const userMfa = await prisma.userMfa.findUnique({
      where: { userId: user.id }
    });

    if (!userMfa || !userMfa.isEnabled) {
      throw new AppError('MFA is not enabled on this account', 400, 'MFA_NOT_ENABLED');
    }

    const secret = encryptionService.decrypt(userMfa.secretEncrypted);
    const isValid = verifyTotpCode(secret, cleanCode);

    if (!isValid) {
      throw new AppError('Invalid MFA code. Verification required to disable MFA', 400, 'INVALID_MFA_CODE');
    }

    await prisma.userMfa.delete({
      where: { userId: user.id }
    });

    await auditService.log({
      actorId: user.id,
      action: 'MFA_DISABLED',
      entityType: 'UserMfa',
      entityId: user.id,
      metadata: { role: user.role },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    logger.info({ userId: user.id }, 'MFA disabled for user');

    const accessToken = tokenService.generateAccessToken(user, { mfaVerified: false });

    return {
      isMfaEnabled: false,
      accessToken
    };
  },

  /**
   * Retrieves MFA status for a user.
   */
  async getMfaStatus(userId) {
    const userMfa = await prisma.userMfa.findUnique({
      where: { userId }
    });

    return {
      isMfaEnabled: Boolean(userMfa?.isEnabled),
      enrolledAt: userMfa?.enrolledAt || null
    };
  }
};
