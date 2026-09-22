import { Router } from 'express';
import { healthRouter } from './health.js';
import { authRouter } from './auth.js';
import { usersRouter } from './users.js';
import { learningRouter } from './learning.js';
import { srsRouter } from './srs.js';
import { gamificationRouter } from './gamification.js';
import { curriculumRouter } from './curriculum.js';

export const apiV1Router = Router();

// Mount sub-routers
apiV1Router.use('/health', healthRouter);
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/users', usersRouter);
apiV1Router.use('/learning', learningRouter);
apiV1Router.use('/srs', srsRouter);
apiV1Router.use('/gamification', gamificationRouter);
apiV1Router.use('/curriculum', curriculumRouter);


