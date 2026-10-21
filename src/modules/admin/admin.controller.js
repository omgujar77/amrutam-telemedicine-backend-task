import { adminService } from './admin.service.js';

export const adminController = {
  /**
   * POST /api/v1/admin/doctors/:doctorId/verify
   */
  async verifyDoctor(req, res, next) {
    try {
      const { doctorId } = req.params;
      const result = await adminService.verifyDoctor(
        req.user,
        doctorId,
        req.body,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      );

      return res.status(200).json({
        success: true,
        message: `Doctor verification status updated to ${result.verificationStatus}`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/audit-logs
   */
  async listAuditLogs(req, res, next) {
    try {
      const result = await adminService.listAuditLogs(req.user, req.query);

      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/overview
   */
  async getSecurityOverview(req, res, next) {
    try {
      const result = await adminService.getSecurityOverview(req.user);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/analytics/overview
   */
  async getAnalyticsOverview(req, res, next) {
    try {
      const result = await adminService.getAnalyticsOverview(req.user, req.query);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
};
