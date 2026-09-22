import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { IncomingMessage, ServerResponse } from 'http';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { requestIdMiddleware } from './middlewares/request-id.js';
import { errorHandler } from './middlewares/error-handler.js';
import { apiV1Router } from './routes/index.js';
import { healthRouter } from './routes/health.js';
import { NotFoundError } from './errors/app-error.js';

export function createApp(): Express {
  const app = express();

  // Disable x-powered-by header
  app.disable('x-powered-by');

  // Trust proxy in production if behind reverse proxy
  if (config.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'https:', 'data:'],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null
        }
      },
      crossOriginEmbedderPolicy: false
    })
  );

  // CORS Configuration
  const allowedOrigins = config.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS policy does not allow access from origin: ${origin}`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'X-Timezone']
    })
  );

  // Request ID tracking
  app.use(requestIdMiddleware);

  // Structured HTTP Request Logging (silent in test)
  if (config.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req: IncomingMessage) => (req as Request).id ?? 'unknown',
        customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
          if (res.statusCode >= 500 || err) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        serializers: {
          req: (req: IncomingMessage) => {
            const expressReq = req as Request;
            return {
              id: expressReq.id,
              method: expressReq.method,
              url: expressReq.url,
              remoteAddress: expressReq.socket?.remoteAddress
            };
          },
          res: (res: ServerResponse) => ({
            statusCode: res.statusCode
          })
        }
      })
    );
  }

  // Payload body parsers with strict size limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Root health check endpoint
  app.use('/health', healthRouter);

  // Versioned API routes
  app.use(config.API_PREFIX, apiV1Router);

  // 404 Handler for undefined routes
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError('Route', `${req.method} ${req.originalUrl}`));
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
