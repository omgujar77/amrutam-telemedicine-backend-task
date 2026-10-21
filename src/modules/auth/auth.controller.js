import { authService } from './auth.service.js';
import { env } from '../../config/env.js';

const COOKIE_NAME = 'refreshToken';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

export const authController = {
  /**
   * POST /api/v1/auth/register
   */
  async register(req, res, next) {
    try {
      const result = await authService.registerPatient(req.body);

      // Set refresh token in HttpOnly cookie
      res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);

      return res.status(201).json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/auth/login
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await authService.login({
        email,
        password,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip
      });

      if (result.mfaRequired) {
        return res.status(200).json({
          success: true,
          mfaRequired: true,
          message: 'Multi-factor authentication code required',
          data: {
            user: result.user,
            tempToken: result.tempToken
          }
        });
      }

      // Set refresh token in HttpOnly cookie
      res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);

      return res.status(200).json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/auth/refresh
   */
  async refresh(req, res, next) {
    try {
      // Allow refresh token via cookie or request body (useful for mobile/test clients)
      const rawRefreshToken = req.cookies?.[COOKIE_NAME] || req.body?.refreshToken;

      const result = await authService.refreshTokens(rawRefreshToken);

      // Rotate cookie
      res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);

      return res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/auth/logout
   */
  async logout(req, res, next) {
    try {
      const rawRefreshToken = req.cookies?.[COOKIE_NAME] || req.body?.refreshToken;
      await authService.logout(rawRefreshToken);

      // Clear cookie
      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: env.COOKIE_SAME_SITE
      });

      return res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      next(error);
    }
  }
};
