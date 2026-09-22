import { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../errors/app-error.js';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimiterMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
  reset(): void;
}

export function createRateLimiter(options: {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: Request) => string;
}): RateLimiterMiddleware {
  const windowMs = options.windowMs ?? 60000; // 1 minute
  const max = options.max ?? 5; // 5 attempts per minute
  const keyGen = options.keyGenerator ?? ((req: Request) => req.ip || req.socket.remoteAddress || 'unknown');

  const tracker = new Map<string, RateLimitRecord>();

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGen(req);
    const now = Date.now();
    const record = tracker.get(key);

    if (!record || now > record.resetAt) {
      tracker.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('RateLimit-Limit', max);
      res.setHeader('RateLimit-Remaining', max - 1);
      res.setHeader('RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
      return next();
    }

    if (record.count >= max) {
      res.setHeader('RateLimit-Limit', max);
      res.setHeader('RateLimit-Remaining', 0);
      res.setHeader('RateLimit-Reset', Math.ceil(record.resetAt / 1000));
      return next(
        new RateLimitError(
          `Rate limit exceeded. Maximum ${max} requests allowed per ${windowMs / 1000} seconds.`
        )
      );
    }

    record.count += 1;
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', max - record.count);
    res.setHeader('RateLimit-Reset', Math.ceil(record.resetAt / 1000));
    next();
  };

  middleware.reset = () => {
    tracker.clear();
  };

  return middleware;
}
