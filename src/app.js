import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { logger } from './common/logger/logger.js';
import { requestIdMiddleware } from './common/middleware/requestId.js';
import { notFoundHandler } from './common/middleware/notFound.js';
import { errorHandler } from './common/errors/errorHandler.js';
import { healthRouter } from './modules/health/healthRoutes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { userRouter } from './modules/users/user.routes.js';
import { doctorRouter } from './modules/doctors/doctor.routes.js';
import { bookingRouter } from './modules/bookings/booking.routes.js';
import { consultationRouter } from './modules/consultations/consultation.routes.js';
import { prescriptionRouter } from './modules/prescriptions/prescription.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';

export const app = express();

// Security headers (relax contentSecurityPolicy for Swagger UI)
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

// Request ID attachment (generates or forwards X-Request-Id)
app.use(requestIdMiddleware);

// Structured HTTP request logging
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Don't log request or response bodies by default
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress
      }),
      res: (res) => ({
        statusCode: res.statusCode
      })
    }
  })
);

// JSON body parsing with sensible limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Cookie parser for secure HttpOnly refresh token cookies
app.use(cookieParser());

// Health check routes
app.use('/health', healthRouter);

// Swagger UI API Documentation (/api-docs)
try {
  const openApiPath = path.resolve(process.cwd(), 'docs/openapi.yaml');
  if (fs.existsSync(openApiPath)) {
    const fileContent = fs.readFileSync(openApiPath, 'utf8');
    const swaggerDocument = YAML.parse(fileContent);

    app.get('/api-docs/json', (_req, res) => res.json(swaggerDocument));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
      customSiteTitle: 'Amrutam Telemedicine API Documentation'
    }));
  }
} catch (err) {
  logger.warn({ err: err.message }, 'Failed to initialize Swagger UI documentation');
}

// API v1 feature routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/doctors', doctorRouter);
app.use('/api/v1/bookings', bookingRouter);
app.use('/api/v1/consultations', consultationRouter);
app.use('/api/v1/prescriptions', prescriptionRouter);
app.use('/api/v1/admin', adminRouter);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Centralized error handler (must be last middleware)
app.use(errorHandler);

export default app;
