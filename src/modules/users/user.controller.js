import { userService } from './user.service.js';

export const userController = {
  /**
   * GET /api/v1/users/me
   */
  async getMe(req, res, next) {
    try {
      const user = await userService.getMe(req.user.id);
      return res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/v1/users/me
   */
  async updateMe(req, res, next) {
    try {
      const user = await userService.updateMe(req.user.id, req.body);
      return res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/users/me/patient-profile
   */
  async getPatientProfile(req, res, next) {
    try {
      const profile = await userService.getPatientProfile(req.user.id);
      return res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/v1/users/me/patient-profile
   */
  async updatePatientProfile(req, res, next) {
    try {
      const profile = await userService.updatePatientProfile(req.user.id, req.body);
      return res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/users/me/doctor-profile
   */
  async getDoctorProfile(req, res, next) {
    try {
      const profile = await userService.getDoctorProfile(req.user.id);
      return res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PATCH /api/v1/users/me/doctor-profile
   */
  async updateDoctorProfile(req, res, next) {
    try {
      const profile = await userService.updateDoctorProfile(req.user.id, req.body);
      return res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      next(error);
    }
  }
};
