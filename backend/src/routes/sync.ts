import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import { SyncService } from '../sync/sync-service.js';
import { AuthenticationError } from '../errors/app-error.js';

export function createSyncRouter(customSyncService?: SyncService): Router {
  const router = Router();

  // All sync routes require authentication
  router.use(authenticate());

  const getService = () => customSyncService ?? new SyncService();

  const commandSchema = z.object({
    command_id: z.string(),
    installation_id: z.string().min(3),
    client_seq: z.number().int().positive(),
    command_type: z.enum(['SUBMIT_LESSON_ATTEMPT', 'SUBMIT_REVIEW_CARD', 'SUBMIT_REFLECTION']),
    payload: z.record(z.any()),
    client_timestamp: z.string()
  });

  const syncBatchSchema = z.object({
    commands: z.array(commandSchema).min(1, 'At least one command is required in sync batch')
  });

  // POST /api/v1/learning/sync - canonical offline action queue ingestion
  router.post(
    '/sync',
    validateRequest({ body: syncBatchSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) throw new AuthenticationError('User not authenticated');
        const result = await getService().syncBatch(req.user.id, req.body.commands);
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

export const syncRouter = createSyncRouter();
