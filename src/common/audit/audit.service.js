import { prisma } from '../../config/database.js';
import { logger } from '../logger/logger.js';

export const auditService = {
  /**
   * Records an immutable audit log entry.
   * Can run standalone or inside an existing Prisma transaction client.
   *
   * @param {Object} params
   * @param {string|null} params.actorId - ID of user performing the action
   * @param {string} params.action - Canonical event name (e.g. CONSULTATION_STARTED)
   * @param {string} params.entityType - Target entity type (e.g. Consultation, Prescription)
   * @param {string} params.entityId - Primary ID of target entity
   * @param {Object} [params.metadata] - Sanitized contextual metadata (no tokens/secrets/PHI)
   * @param {string} [params.ipAddress] - Client IP address
   * @param {string} [params.userAgent] - Client User Agent string
   * @param {Object} [tx] - Optional Prisma transaction client
   */
  async log({ actorId, action, entityType, entityId, metadata, ipAddress, userAgent }, tx = null) {
    const db = tx || prisma;

    // Strict sanitization of metadata to ensure no secrets or sensitive details are logged
    const sanitizedMetadata = metadata ? this.sanitizeMetadata(metadata) : null;

    try {
      const entry = await db.auditLog.create({
        data: {
          actorId: actorId || null,
          action,
          entityType,
          entityId,
          metadata: sanitizedMetadata,
          ipAddress: ipAddress ? String(ipAddress).slice(0, 45) : null,
          userAgent: userAgent ? String(userAgent).slice(0, 255) : null
        }
      });

      logger.info({ action, entityType, entityId, actorId }, 'Audit event recorded');
      return entry;
    } catch (err) {
      logger.error({ err: err.message, action, entityType, entityId }, 'Failed to write audit log entry');
      // If running inside a transaction, re-throwing ensures atomic consistency
      if (tx) {
        throw err;
      }
      return null;
    }
  },

  /**
   * Redacts sensitive keys from audit metadata.
   */
  sanitizeMetadata(metadata) {
    if (typeof metadata !== 'object' || metadata === null) return metadata;

    const sensitiveKeys = ['password', 'token', 'secret', 'hash', 'authorization', 'medicines'];
    const sanitized = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
};
