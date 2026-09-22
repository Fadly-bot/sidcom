import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  // Sanitize incoming request ID: alphanumeric and dashes only, max 64 chars
  const validId =
    typeof incomingId === 'string' && /^[a-zA-Z0-9\-_]{8,64}$/.test(incomingId)
      ? incomingId
      : randomUUID();

  req.id = validId;
  res.setHeader('x-request-id', validId);
  next();
}
