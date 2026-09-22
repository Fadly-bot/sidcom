import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.id;

  // Handle JSON parse errors from express.json()
  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400 && 'body' in err) {
    res.status(400).json({
      error: {
        code: 'MALFORMED_JSON',
        message: 'Request payload contains malformed JSON',
        requestId
      }
    });
    return;
  }

  // Handle known operational AppErrors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, `Operational server error: ${err.message}`);
    } else {
      logger.warn({ err, requestId }, `Client request error: ${err.message}`);
    }

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
        requestId
      }
    });
    return;
  }

  // Unknown programmer / unhandled error
  const standardError = err instanceof Error ? err : new Error(String(err));
  logger.error({ err: standardError, requestId }, `Unhandled internal error: ${standardError.message}`);

  const isProduction = config.NODE_ENV === 'production';

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isProduction
        ? 'An unexpected error occurred. Please contact support.'
        : standardError.message,
      ...(!isProduction ? { stack: standardError.stack } : {}),
      requestId
    }
  });
};
