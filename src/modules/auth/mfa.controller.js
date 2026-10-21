import { mfaService } from './mfa.service.js';

export const mfaController = {
  /**
   * POST /api/v1/auth/mfa/setup
   * Privileged users (ADMIN, DOCTOR) initiate MFA setup.
   */
  async setup(req, res, next) {
    try {
      const result = await mfaService.setupMfa(req.user);
      return res.status(200).json({
        success: true,
        message: 'MFA setup initiated. Scan the QR code or enter the secret in your authenticator app.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/auth/mfa/verify
   * Verifies initial code and activates MFA.
   */
  async verify(req, res, next) {
    try {
      const context = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };

      const result = await mfaService.verifyAndEnableMfa(req.user, req.body.code, context);
      return res.status(200).json({
        success: true,
        message: 'MFA successfully enabled and verified',
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/auth/mfa/challenge
   * Verifies MFA code during login or step-up.
   */
  async challenge(req, res, next) {
    try {
      const context = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };

      const result = await mfaService.verifyMfaChallenge(req.user, req.body.code, context);
      return res.status(200).json({
        success: true,
        message: 'MFA verification successful',
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/auth/mfa/disable
   * Disables MFA requiring valid TOTP code.
   */
  async disable(req, res, next) {
    try {
      const context = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };

      const result = await mfaService.disableMfa(req.user, req.body.code, context);
      return res.status(200).json({
        success: true,
        message: 'MFA disabled successfully',
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/auth/mfa/status
   */
  async getStatus(req, res, next) {
    try {
      const result = await mfaService.getMfaStatus(req.user.id);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
};
