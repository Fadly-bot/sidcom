import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../auth/token.js';
import { AuthService, UserRecord } from '../auth/auth-service.js';
import { AuthenticationError, ForbiddenError } from '../errors/app-error.js';

declare global {
  namespace Express {
    interface Request {
      user?: UserRecord;
    }
  }
}

export function authenticate(authService?: AuthService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = authService ?? new AuthService();
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthenticationError('Authorization header with Bearer token is required');
      }

      const token = authHeader.slice(7).trim();
      if (!token) {
        throw new AuthenticationError('Bearer token cannot be empty');
      }

      const payload = verifyAccessToken(token);
      const user = await auth.getUserById(payload.userId);
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function authorizeUser(paramName = 'userId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    const targetUserId = req.params[paramName];
    if (targetUserId && targetUserId !== req.user.id) {
      return next(
        new ForbiddenError("Access forbidden: You cannot access or modify another user's resources")
      );
    }

    next();
  };
}
