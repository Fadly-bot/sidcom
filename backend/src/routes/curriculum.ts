import { Router, Request, Response, NextFunction } from 'express';
import { CurriculumService } from '../curriculum/curriculum-service.js';
import { ValidationError } from '../errors/app-error.js';

export function createCurriculumRouter(customService?: CurriculumService): Router {
  const router = Router();

  const getService = () => customService ?? new CurriculumService();

  /**
   * GET /api/v1/curriculum/overview
   * Returns course structure, 12 phases, and 52 weeks.
   */
  router.get('/overview', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const overview = await getService().getCurriculumOverview();
      res.json(overview);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/v1/curriculum/lessons/:day
   * Returns curriculum lesson detail by day number (1 to 365).
   */
  router.get('/lessons/:day', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dayParam = req.params['day'];
      const dayNumber = parseInt(dayParam ?? '0', 10);

      if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 365) {
        throw new ValidationError(`Day number must be an integer between 1 and 365. Received '${dayParam}'`);
      }

      const lessonDetail = await getService().getLessonByDay(dayNumber);
      res.json(lessonDetail);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/v1/curriculum/validate
   * Validates full 365-day curriculum against all architectural & pedagogical constraints.
   */
  router.get('/validate', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = await getService().validateCurriculumIntegrity();
      res.json(validation);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const curriculumRouter = createCurriculumRouter();
