import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/AppError.js';

const JWT_ISSUER = 'amrutam-telemedicine-backend';
const JWT_AUDIENCE = 'amrutam-api';

/**
 * Service for issuing and verifying JWT access tokens and generating secure refresh tokens.
 */
export const tokenService = {
  /**
   * Generates a short-lived access token with minimal user claims.
   * @param {{ id: string, email: string, role: string }} user
   * @returns {string} Signed JWT
   */
  generateAccessToken(user, { mfaVerified = false } = {}) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      mfaVerified: Boolean(mfaVerified)
    };

    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: env.JWT_ACCESS_EXPIRATION,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });
  },

  /**
   * Generates a temporary access token for MFA challenge completion.
   * @param {{ id: string, email: string, role: string }} user
   * @returns {string} Signed JWT with mfaVerified: false
   */
  generateTempToken(user) {
    return this.generateAccessToken(user, { mfaVerified: false });
  },

  /**
   * Verifies and decodes an access token.
   * @param {string} token
   * @returns {{ sub: string, email: string, role: string }} Decoded payload
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
      });
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Access token has expired', 401, 'TOKEN_EXPIRED');
      }
      throw new AppError('Invalid access token', 401, 'INVALID_TOKEN');
    }
  },

  /**
   * Generates a cryptographically random raw refresh token string.
   * @returns {string} 64-character random hex string
   */
  generateRefreshToken() {
    return randomBytes(32).toString('hex');
  },

  /**
   * Hashes a refresh token using SHA-256 for safe storage in the database.
   * Raw refresh tokens are never persisted in plain text.
   * @param {string} rawToken
   * @returns {string} SHA-256 hash hex string
   */
  hashRefreshToken(rawToken) {
    return createHash('sha256').update(rawToken).digest('hex');
  },

  /**
   * Calculates the expiration Date for a refresh token (default 7 days).
   * @returns {Date}
   */
  getRefreshTokenExpiresAt() {
    // 7 days in milliseconds
    const durationMs = 7 * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + durationMs);
  }
};
