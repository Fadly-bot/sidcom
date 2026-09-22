import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import { SrsService } from '../srs/srs-service.js';
import { AuthenticationError } from '../errors/app-error.js';

export function createSrsRouter(customSrsService?: SrsService): Router {
  const router = Router();

  // All SRS routes require authentication
  router.use(authenticate());

  const getService = () => customSrsService ?? new SrsService();

  const reviewSubmissionSchema = z.object({
    review_card_id: z.string(),
    score_percentage: z.number().min(0).max(100),
    rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    elapsed_active_seconds: z.number().int().nonnegative().optional()
  });

  // GET /api/v1/srs/debt - get current user's 3-tier review debt status
  router.get('/debt', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthenticationError('User not authenticated');
      const debt = await getService().calculateReviewDebt(req.user.id);
      res.status(200).json({ debt });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/srs/session - get 5 to 8 due ReviewCards for study session
  router.get('/session', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AuthenticationError('User not authenticated');
      const limitParam = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 8;
      const cards = await getService().getReviewSession(req.user.id, limitParam);
      res.status(200).json({
        cards,
        count: cards.length
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/srs/review - submit single ReviewCard attempt and update DSR memory
  router.post(
    '/review',
    validateRequest({ body: reviewSubmissionSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) throw new AuthenticationError('User not authenticated');
        const result = await getService().processReviewSubmission(req.user.id, {
          review_card_id: req.body.review_card_id,
          score_percentage: req.body.score_percentage,
          rating: req.body.rating,
          elapsed_active_seconds: req.body.elapsed_active_seconds
        });

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

export const srsRouter = createSrsRouter();
