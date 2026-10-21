import { tokenService } from './token.service.js';
import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/AppError.js';

/**
 * Authentication middleware.
 * Validates Bearer access token, verifies signature and claims, checks account status,
 * and attaches a minimal authenticated user object to `req.user`.
 */
export async function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication token is required', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AppError('Authentication token is missing', 401, 'UNAUTHORIZED');
    }

    // Verify token
    const payload = tokenService.verifyAccessToken(token);

    // Retrieve active user from database
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        name: true
      }
    });

    if (!user) {
      throw new AppError('User belonging to this token no longer exists', 401, 'USER_NOT_FOUND');
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError('User account is inactive or suspended', 403, 'ACCOUNT_INACTIVE');
    }

    // Attach minimal safe user object with verified MFA status to request
    req.user = {
      ...user,
      mfaVerified: Boolean(payload.mfaVerified)
    };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Role-Based Access Control (RBAC) middleware factory.
 * Enforces that `req.user.role` is within the permitted roles list.
 * @param {...string} allowedRoles - e.g. 'ADMIN', 'DOCTOR', 'PATIENT'
 */
export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('User authentication required before authorization', 401, 'UNAUTHORIZED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          'Forbidden: You do not have the required permissions to access this resource',
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
}

/**
 * Multi-Factor Authentication (MFA) enforcement middleware.
 * Verifies that the authenticated request carries an active, server-verified MFA claim.
 */
export function requireMfa(req, _res, next) {
  if (!req.user) {
    return next(new AppError('User authentication required before MFA authorization', 401, 'UNAUTHORIZED'));
  }

  if (!req.user.mfaVerified) {
    return next(
      new AppError(
        'Multi-factor authentication (MFA) verification is required for this operation',
        403,
        'MFA_REQUIRED'
      )
    );
  }

  next();
}
