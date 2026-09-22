import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../auth/auth-service.js';
import { validateRequest } from '../middlewares/validate.js';
import { createRateLimiter } from '../middlewares/rate-limit.js';
import { config } from '../config/index.js';
import { AuthenticationError } from '../errors/app-error.js';

export const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5
});

export function createAuthRouter(
  authService = new AuthService(),
  customLimiter = authLimiter
): Router {
  const router = Router();

  const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    displayName: z.string().min(2, 'Display name must be at least 2 characters long').max(100),
    timezone: z.string().optional()
  });

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required')
  });

  const limiter = customLimiter;

  // Cookie configuration helper
  const setRefreshCookie = (res: Response, token: string) => {
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth'
    });
  };

  // POST /api/v1/auth/register
  router.post(
    '/register',
    limiter,
    validateRequest({ body: registerSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { email, password, displayName, timezone } = req.body;
        const result = await authService.register({
          email,
          password,
          displayName,
          timezone
        });

        setRefreshCookie(res, result.tokens.refreshToken);

        res.status(201).json({
          user: result.user,
          accessToken: result.tokens.accessToken,
          expiresIn: result.tokens.expiresInSeconds
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/auth/login
  router.post(
    '/login',
    limiter,
    validateRequest({ body: loginSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { email, password } = req.body;
        const result = await authService.login({ email, password });

        setRefreshCookie(res, result.tokens.refreshToken);

        res.status(200).json({
          user: result.user,
          accessToken: result.tokens.accessToken,
          expiresIn: result.tokens.expiresInSeconds
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/auth/refresh
  router.post(
    '/refresh',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const rawToken = req.cookies?.refreshToken ?? req.body?.refreshToken;
        if (!rawToken || typeof rawToken !== 'string') {
          throw new AuthenticationError('Refresh token is required');
        }

        const rotated = await authService.rotateRefreshToken(rawToken);
        setRefreshCookie(res, rotated.refreshToken);

        res.status(200).json({
          accessToken: rotated.accessToken,
          expiresIn: rotated.expiresInSeconds
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/auth/logout
  router.post(
    '/logout',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const rawToken = req.cookies?.refreshToken ?? req.body?.refreshToken;
        if (rawToken && typeof rawToken === 'string') {
          await authService.revokeRefreshToken(rawToken);
        }

        res.clearCookie('refreshToken', {
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/api/v1/auth'
        });

        res.status(200).json({
          message: 'Successfully logged out'
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

export const authRouter = createAuthRouter();
