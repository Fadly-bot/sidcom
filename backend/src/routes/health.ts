import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: config.NODE_ENV
  });
});
