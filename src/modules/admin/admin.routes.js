import { Router } from 'express';
import { adminController } from './admin.controller.js';
import { authenticate, authorize, requireMfa } from '../auth/auth.middleware.js';
import { validateBody, validateQuery } from '../../common/middleware/validate.js';
import { verifyDoctorSchema, listAuditLogsQuerySchema, analyticsOverviewQuerySchema } from './admin.validation.js';

export const adminRouter = Router();

// All administrative routes require authentication, ADMIN role, and verified MFA
adminRouter.use(authenticate);
adminRouter.use(authorize('ADMIN'));
adminRouter.use(requireMfa);

/**
 * POST /api/v1/admin/doctors/:doctorId/verify
 * Approves or rejects doctor credentials
 */
adminRouter.post(
  '/doctors/:doctorId/verify',
  validateBody(verifyDoctorSchema),
  adminController.verifyDoctor
);

/**
 * GET /api/v1/admin/audit-logs
 * Retrieves paginated system audit logs with optional filters
 */
adminRouter.get(
  '/audit-logs',
  validateQuery(listAuditLogsQuerySchema),
  adminController.listAuditLogs
);

/**
 * GET /api/v1/admin/overview
 * Returns security and system status overview
 */
adminRouter.get(
  '/overview',
  adminController.getSecurityOverview
);

/**
 * GET /api/v1/admin/analytics/overview
 * Returns administrative metrics and KPIs with time-window filtering
 */
adminRouter.get(
  '/analytics/overview',
  validateQuery(analyticsOverviewQuerySchema),
  adminController.getAnalyticsOverview
);
