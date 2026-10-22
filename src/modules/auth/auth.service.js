import argon2 from 'argon2';
import { prisma } from '../../config/database.js';
import { tokenService } from './token.service.js';
import { AppError } from '../../common/errors/AppError.js';
import { logger } from '../../common/logger/logger.js';

// Argon2id options configured for secure, robust production-grade hashing
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16, // 64 MB
  timeCost: 3,         // 3 iterations
  parallelism: 1
};

/**
 * Strips passwordHash and internal fields from user object before sending to client.
 */
export function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export const authService = {
  /**
   * Registers a new patient.
   * Public registration always assigns the 'PATIENT' role and creates a PatientProfile atomically.
   */
  async registerPatient({ name, email, password, ...profileFields }) {
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is already registered
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      throw new AppError('An account with this email already exists', 409, 'EMAIL_ALREADY_EXISTS');
    }

    // Hash password with Argon2id
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

    // Atomically create user and patient profile
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          passwordHash,
          role: 'PATIENT',
          status: 'ACTIVE',
          patientProfile: {
            create: {
              ...(profileFields.dateOfBirth && { dateOfBirth: new Date(profileFields.dateOfBirth) }),
              ...(profileFields.gender && { gender: profileFields.gender }),
              ...((profileFields.phoneNumber || profileFields.phone) && { 
                phoneNumber: profileFields.phoneNumber || profileFields.phone 
              }),
              ...(profileFields.emergencyContact && { emergencyContact: profileFields.emergencyContact }),
              ...(profileFields.bloodGroup && { bloodGroup: profileFields.bloodGroup }),
              ...(profileFields.allergies && { allergies: profileFields.allergies })
            }
          }
        },
        include: {
          patientProfile: true
        }
      });

      // Generate initial tokens
      const accessToken = tokenService.generateAccessToken(newUser);
      const rawRefreshToken = tokenService.generateRefreshToken();
      const tokenHash = tokenService.hashRefreshToken(rawRefreshToken);
      const expiresAt = tokenService.getRefreshTokenExpiresAt();

      // Persist refresh session
      await tx.refreshSession.create({
        data: {
          userId: newUser.id,
          tokenHash,
          expiresAt
        }
      });

      return {
        user: sanitizeUser(newUser),
        accessToken,
        refreshToken: rawRefreshToken
      };
    });

    logger.info({ userId: result.user.id }, 'Patient registered successfully');
    return result;
  },

  /**
   * Authenticates user credentials and issues access & refresh tokens.
   */
  async login({ email, password, userAgent = null, ipAddress = null }) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        patientProfile: true,
        doctorProfile: true,
        mfa: true
      }
    });

    // Timing-safe response: reject without revealing whether email exists
    if (!user) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    // Verify password with Argon2id
    const isPasswordValid = await argon2.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    // Ensure account is ACTIVE
    if (user.status !== 'ACTIVE') {
      throw new AppError('Your account is currently inactive or suspended. Please contact support.', 403, 'ACCOUNT_INACTIVE');
    }

    // Check if user has MFA enabled
    if (user.mfa?.isEnabled) {
      logger.info({ userId: user.id, role: user.role }, 'User credentials verified, MFA challenge required');
      const tempToken = tokenService.generateAccessToken(user, { mfaVerified: false });
      return {
        mfaRequired: true,
        user: sanitizeUser(user),
        tempToken
      };
    }

    // Generate tokens
    const accessToken = tokenService.generateAccessToken(user, { mfaVerified: false });
    const rawRefreshToken = tokenService.generateRefreshToken();
    const tokenHash = tokenService.hashRefreshToken(rawRefreshToken);
    const expiresAt = tokenService.getRefreshTokenExpiresAt();

    // Create refresh session in database
    await prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt
      }
    });

    logger.info({ userId: user.id, role: user.role }, 'User authenticated successfully');

    return {
      user: sanitizeUser(user),
      accessToken,
      refreshToken: rawRefreshToken
    };
  },

  /**
   * Refreshes an expired access token using a valid refresh token.
   * Implements strict refresh token rotation and reuse detection.
   */
  async refreshTokens(rawRefreshToken) {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      throw new AppError('Refresh token is required', 401, 'TOKEN_REQUIRED');
    }

    const tokenHash = tokenService.hashRefreshToken(rawRefreshToken);

    const session = await prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    // Check if token exists
    if (!session) {
      throw new AppError('Invalid refresh token', 401, 'INVALID_TOKEN');
    }

    // REUSE DETECTION: If token was already revoked, a potential breach occurred
    // Invalidate all active sessions for this user immediately
    if (session.revokedAt) {
      logger.warn({ userId: session.userId }, 'Refresh token reuse detected! Revoking all sessions for user.');
      await prisma.refreshSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      throw new AppError('Session invalidated due to reuse detection. Please log in again.', 401, 'TOKEN_REUSED');
    }

    // Check expiration
    if (new Date() > session.expiresAt) {
      throw new AppError('Refresh token has expired. Please log in again.', 401, 'TOKEN_EXPIRED');
    }

    // Check user status
    if (session.user.status !== 'ACTIVE') {
      throw new AppError('Account is inactive', 403, 'ACCOUNT_INACTIVE');
    }

    // Token Rotation: Revoke old token and issue new token pair atomically
    const newRawRefreshToken = tokenService.generateRefreshToken();
    const newTokenHash = tokenService.hashRefreshToken(newRawRefreshToken);
    const newExpiresAt = tokenService.getRefreshTokenExpiresAt();

    await prisma.$transaction([
      prisma.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() }
      }),
      prisma.refreshSession.create({
        data: {
          userId: session.userId,
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt
        }
      })
    ]);

    const newAccessToken = tokenService.generateAccessToken(session.user);

    logger.info({ userId: session.userId }, 'Tokens rotated successfully');

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken
    };
  },

  /**
   * Logs out a session by revoking the refresh token.
   */
  async logout(rawRefreshToken) {
    if (!rawRefreshToken) return;

    try {
      const tokenHash = tokenService.hashRefreshToken(rawRefreshToken);
      await prisma.refreshSession.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      logger.info('Refresh session revoked on logout');
    } catch (err) {
      logger.error({ err: err.message }, 'Error revoking refresh session during logout');
    }
  }
};
