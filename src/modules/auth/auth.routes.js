import { Router } from 'express';
import { authController } from './auth.controller.js';
import { mfaController } from './mfa.controller.js';
import { registerSchema, loginSchema, refreshSchema, mfaCodeSchema, validateBody } from './auth.validation.js';
import { authRateLimiter, mfaRateLimiter } from '../../common/middleware/rateLimiter.js';
import { authenticate } from './auth.middleware.js';

export const authRouter = Router();

// Registration endpoint (Rate-limited, patient registration only)
authRouter.post(
  '/register',
  authRateLimiter,
  validateBody(registerSchema),
  authController.register
);

// Login endpoint (Rate-limited)
authRouter.post(
  '/login',
  authRateLimiter,
  validateBody(loginSchema),
  authController.login
);

// Token refresh endpoint (Rate-limited with rotation)
authRouter.post(
  '/refresh',
  authRateLimiter,
  validateBody(refreshSchema),
  authController.refresh
);

// Logout endpoint (Revocation & cookie clearance)
authRouter.post(
  '/logout',
  authController.logout
);

// ------------------------------------------------------------------------------
// Multi-Factor Authentication (MFA / TOTP) Endpoints (Phase 7)
// ------------------------------------------------------------------------------

// Initiate MFA enrollment (Privileged roles: ADMIN, DOCTOR)
authRouter.post(
  '/mfa/setup',
  authenticate,
  mfaController.setup
);

// Verify initial TOTP code to enable MFA
authRouter.post(
  '/mfa/verify',
  authenticate,
  mfaRateLimiter,
  validateBody(mfaCodeSchema),
  mfaController.verify
);

// Verify TOTP challenge during login / step-up verification
authRouter.post(
  '/mfa/challenge',
  authenticate,
  mfaRateLimiter,
  validateBody(mfaCodeSchema),
  mfaController.challenge
);

// Disable MFA (requires valid current TOTP code)
authRouter.post(
  '/mfa/disable',
  authenticate,
  mfaRateLimiter,
  validateBody(mfaCodeSchema),
  mfaController.disable
);

// Check MFA enrollment status
authRouter.get(
  '/mfa/status',
  authenticate,
  mfaController.getStatus
);
