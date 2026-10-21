import crypto from 'node:crypto';
import { env } from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Derives a strictly 32-byte key from the configured MFA_ENCRYPTION_KEY.
 */
function getDerivedKey() {
  return crypto.createHash('sha256').update(env.MFA_ENCRYPTION_KEY).digest();
}

export const encryptionService = {
  /**
   * Encrypts plaintext string using AES-256-GCM authenticated encryption.
   * Format: ivHex:authTagHex:ciphertextHex
   *
   * @param {string} plaintext
   * @returns {string} Serialized encrypted payload
   */
  encrypt(plaintext) {
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('Plaintext must be a non-empty string');
    }

    const key = getDerivedKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
  },

  /**
   * Decrypts an AES-256-GCM serialized payload.
   *
   * @param {string} encryptedPayload - Format ivHex:authTagHex:ciphertextHex
   * @returns {string} Plaintext
   */
  decrypt(encryptedPayload) {
    if (!encryptedPayload || typeof encryptedPayload !== 'string') {
      throw new Error('Invalid encrypted payload');
    }

    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted payload format');
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = getDerivedKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
};
