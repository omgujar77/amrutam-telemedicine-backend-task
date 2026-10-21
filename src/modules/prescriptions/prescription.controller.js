import { prescriptionService } from './prescription.service.js';

export const prescriptionController = {
  /**
   * POST /api/v1/consultations/:consultationId/prescriptions
   */
  async createPrescription(req, res, next) {
    try {
      const context = {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      };

      const prescription = await prescriptionService.createPrescription(
        req.user.id,
        req.params.consultationId,
        req.body,
        context
      );

      return res.status(201).json({
        success: true,
        message: 'Prescription created successfully',
        data: prescription
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/consultations/:consultationId/prescriptions
   */
  async getPrescriptionsByConsultation(req, res, next) {
    try {
      const prescriptions = await prescriptionService.getPrescriptionsByConsultation(
        req.user,
        req.params.consultationId
      );

      return res.status(200).json({
        success: true,
        data: prescriptions
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/prescriptions/:prescriptionId
   */
  async getPrescriptionById(req, res, next) {
    try {
      const prescription = await prescriptionService.getPrescriptionById(
        req.user,
        req.params.prescriptionId
      );

      return res.status(200).json({
        success: true,
        data: prescription
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/prescriptions/me
   */
  async getMyPrescriptions(req, res, next) {
    try {
      const result = await prescriptionService.getMyPrescriptions(req.user, req.query);

      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }
};
