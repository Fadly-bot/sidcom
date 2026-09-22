import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorizeUser } from '../middlewares/auth.js';
import { AuthService } from '../auth/auth-service.js';
import { StreakService } from '../gamification/streak-service.js';
import { SrsService } from '../srs/srs-service.js';
import { LearningService } from '../learning/learning-service.js';

export function createUsersRouter(
  authService = new AuthService(),
  customStreakService?: StreakService,
  customSrsService?: SrsService,
  customLearningService?: LearningService
): Router {
  const router = Router();
  const getStreakService = () => customStreakService ?? new StreakService();
  const getSrsService = () => customSrsService ?? new SrsService();
  const getLearningService = () => customLearningService ?? new LearningService();

  // All user routes require authentication
  router.use(authenticate(authService));

  // GET /api/v1/users/me - returns active authenticated profile
  router.get('/me', (req: Request, res: Response) => {
    res.status(200).json({
      user: req.user
    });
  });

  // GET /api/v1/users/me/dashboard - canonical learner command center
  router.get('/me/dashboard', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const streakStatus = await getStreakService().getStreakStatus(userId);
      const debt = await getSrsService().calculateReviewDebt(userId);
      const pathProgress = await getLearningService().getUserPathProgress(userId);

      // Find current active lesson (first AVAILABLE or first non-COMPLETED)
      const currentLesson = pathProgress.find((p) => p.state === 'AVAILABLE') ??
        pathProgress.find((p) => p.state === 'REVIEW_REQUIRED') ??
        pathProgress[0];

      res.status(200).json({
        active_streak: streakStatus.current_streak,
        banked_freezes: streakStatus.banked_freezes,
        today_completed: streakStatus.is_active_today,
        local_day_remaining_seconds: streakStatus.seconds_until_midnight,
        today_lesson: currentLesson
          ? {
              lesson_id: currentLesson.id,
              day_number: currentLesson.day_number,
              title: currentLesson.title,
              state: currentLesson.state ?? 'AVAILABLE',
              duration_minutes: currentLesson.duration_minutes
            }
          : null,
        due_reviews_count: debt.overdue_count,
        review_debt_tier: debt.tier_name,
        weak_skill_alert: null
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/users/:userId/data - protected by authorization boundary (user isolation)
  router.get(
    '/:userId/data',
    authorizeUser('userId'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.params['userId'];
        if (!userId) {
          res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'User ID is required' } });
          return;
        }
        const user = await authService.getUserById(userId);
        res.status(200).json({
          user,
          privateData: {
            membership: 'ACTIVE_LEARNER',
            enrolledAt: user.created_at
          }
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

export const usersRouter = createUsersRouter();
