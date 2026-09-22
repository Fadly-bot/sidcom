import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import { LearningService } from '../learning/learning-service.js';
import { syncRouter } from './sync.js';
import { AuthenticationError } from '../errors/app-error.js';

export function createLearningRouter(customLearningService?: LearningService): Router {
  const router = Router();

  // All learning routes require authentication
  router.use(authenticate());

  const getService = () => customLearningService ?? new LearningService();

  const submitAttemptSchema = z.object({
    answers: z.array(
      z.object({
        question_id: z.string(),
        selected_option_ids: z.array(z.string())
      })
    ),
    elapsed_active_seconds: z.number().int().nonnegative(),
    client_timestamp: z.string().optional()
  });

  const masteryReviewSchema = z.object({
    review_score: z.number().min(0).max(100)
  });

  // GET /api/v1/learning/progress - full path progression map for active user
  router.get('/progress', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthenticationError('User not authenticated');
      const progress = await getService().getUserPathProgress(req.user.id);
      res.status(200).json({ progress });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/learning/lessons/:lessonId - retrieve lesson content (gates locked nodes)
  router.get('/lessons/:lessonId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthenticationError('User not authenticated');
      const lessonId = req.params['lessonId'];
      if (!lessonId) {
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Lesson ID is required' } });
        return;
      }
      const data = await getService().getLessonDetail(req.user.id, lessonId);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/learning/lessons/:lessonId/submit - authoritative graded submission
  router.post(
    '/lessons/:lessonId/submit',
    validateRequest({ body: submitAttemptSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) throw new AuthenticationError('User not authenticated');
        const lessonId = req.params['lessonId'];
        if (!lessonId) {
          res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Lesson ID is required' } });
          return;
        }

        const result = await getService().submitLessonAttempt(req.user.id, {
          lesson_id: lessonId,
          answers: req.body.answers,
          elapsed_active_seconds: req.body.elapsed_active_seconds,
          client_timestamp: req.body.client_timestamp
        });

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/learning/lessons/:lessonId/mastery-review - Day +1 retrieval submission
  router.post(
    '/lessons/:lessonId/mastery-review',
    validateRequest({ body: masteryReviewSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) throw new AuthenticationError('User not authenticated');
        const lessonId = req.params['lessonId'];
        if (!lessonId) {
          res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Lesson ID is required' } });
          return;
        }

        const updatedProgress = await getService().submitDayPlusOneMasteryReview(
          req.user.id,
          lessonId,
          req.body.review_score
        );

        res.status(200).json({ progress: updatedProgress });
      } catch (err) {
        next(err);
      }
    }
  );

  // Mount offline action queue sync endpoint: POST /api/v1/learning/sync
  router.use('/', syncRouter);

  return router;
}

export const learningRouter = createLearningRouter();
