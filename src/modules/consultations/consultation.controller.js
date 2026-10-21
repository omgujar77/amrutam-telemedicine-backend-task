import { consultationService } from './consultation.service.js';

export const consultationController = {
  /**
   * POST /api/v1/consultations/:consultationId/start
   */
  async startConsultation(req, res, next) {
    try {
      const context = {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      };

      const consultation = await consultationService.startConsultation(
        req.user.id,
        req.params.consultationId,
        context
      );

      return res.status(200).json({
        success: true,
        message: 'Consultation started successfully',
        data: consultation
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/consultations/:consultationId/complete
   */
  async completeConsultation(req, res, next) {
    try {
      const context = {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      };

      const consultation = await consultationService.completeConsultation(
        req.user.id,
        req.params.consultationId,
        req.body,
        context
      );

      return res.status(200).json({
        success: true,
        message: 'Consultation completed successfully',
        data: consultation
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/consultations/me
   */
  async getMyConsultations(req, res, next) {
    try {
      const result = await consultationService.getMyConsultations(req.user, req.query);

      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/consultations/:consultationId
   */
  async getConsultationById(req, res, next) {
    try {
      const consultation = await consultationService.getConsultationById(
        req.user,
        req.params.consultationId
      );

      return res.status(200).json({
        success: true,
        data: consultation
      });
    } catch (err) {
      next(err);
    }
  }
};
