import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { XpService } from '../gamification/xp-service.js';
import { StreakService } from '../gamification/streak-service.js';
import { ValidationError } from '../errors/app-error.js';

export function createGamificationRouter(customXpService?: XpService, customStreakService?: StreakService): Router {
  const router = Router();

  const getXpService = () => customXpService ?? new XpService();
  const getStreakService = () => customStreakService ?? new StreakService();

  // All gamification endpoints require authenticated user session
  router.use(authenticate());

  /**
   * GET /api/v1/gamification/xp
   * Retrieves user's XP summary, daily practice usage against 150 ceiling, and category breakdown.
   */
  router.get('/xp', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const xpSummary = await getXpService().getXpSummary(userId);
      res.json(xpSummary);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/v1/gamification/streak
   * Retrieves current streak, longest streak, banked freezes, midnight countdown, and grace status.
   */
  router.get('/streak', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const streakStatus = await getStreakService().getStreakStatus(userId);
      res.json(streakStatus);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PUT /api/v1/gamification/timezone
   * Authoritatively updates user profile timezone.
   * Enforces 30-day throttle to prevent timezone-hopping streak manipulation.
   */
  router.put('/timezone', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { timezone } = req.body;

      if (!timezone || typeof timezone !== 'string') {
        throw new ValidationError('A valid IANA timezone string is required (e.g. Asia/Jakarta)');
      }

      const result = await getStreakService().updateUserTimezone(userId, timezone);
      res.json({
        message: 'Profile timezone updated successfully',
        profile_timezone: result.profile_timezone,
        last_timezone_changed_at: result.last_timezone_changed_at
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/v1/gamification/streak/recovery
   * Completes a 24-hour grace recovery challenge to restore broken streak.
   */
  router.post('/streak/recovery', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const result = await getStreakService().recordQualifyingActivity(userId, {
        actionType: 'RECOVERY_CHALLENGE'
      });
      res.json({
        message: result.savedByGraceWindow ? 'Streak successfully restored via Recovery Challenge!' : 'Recovery challenge completed',
        ...result
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const gamificationRouter = createGamificationRouter();
