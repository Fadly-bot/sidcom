import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { requestIdMiddleware } from '../src/middlewares/request-id.js';
import {
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError
} from '../src/errors/app-error.js';

describe('Centralized Error Handler & AppError Hierarchy', () => {
  function createTestApp(): Express {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(express.json());

    app.get('/test-validation', () => {
      throw new ValidationError('Invalid input data', [
        { field: 'email', message: 'Email is required', code: 'REQUIRED' }
      ]);
    });

    app.get('/test-auth', () => {
      throw new AuthenticationError('Token expired');
    });

    app.get('/test-forbidden', () => {
      throw new ForbiddenError('Access forbidden');
    });

    app.get('/test-not-found', () => {
      throw new NotFoundError('Lesson', 'L-001');
    });

    app.get('/test-conflict', () => {
      throw new ConflictError('User already registered');
    });

    app.get('/test-rate-limit', () => {
      throw new RateLimitError();
    });

    app.get('/test-internal', () => {
      throw new InternalServerError('Database connection failed');
    });

    app.get('/test-unexpected', () => {
      throw new Error('Unexpected crash');
    });

    app.get('/test-non-error', () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'string primitive error';
    });

    app.post('/test-echo', (req, res) => {
      res.json({ received: req.body });
    });

    app.use(errorHandler);
    return app;
  }

  const app = createTestApp();

  it('should format ValidationError correctly with 400 status', async () => {
    const res = await request(app).get('/test-validation');
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Invalid input data',
      details: [{ field: 'email', message: 'Email is required', code: 'REQUIRED' }],
      requestId: expect.any(String)
    });
  });

  it('should format AuthenticationError with 401 status', async () => {
    const res = await request(app).get('/test-auth');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('should format ForbiddenError with 403 status', async () => {
    const res = await request(app).get('/test-forbidden');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should format NotFoundError with 404 status and custom message', async () => {
    const res = await request(app).get('/test-not-found');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe("Lesson 'L-001' not found");
  });

  it('should format ConflictError with 409 status', async () => {
    const res = await request(app).get('/test-conflict');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('should format RateLimitError with 429 status', async () => {
    const res = await request(app).get('/test-rate-limit');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('should format InternalServerError with 500 status', async () => {
    const res = await request(app).get('/test-internal');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('should catch unexpected errors and return 500 without leaking stack in production', async () => {
    const res = await request(app).get('/test-unexpected');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body.error).toHaveProperty('requestId');
  });

  it('should catch malformed JSON body and return 400 MALFORMED_JSON', async () => {
    const res = await request(app)
      .post('/test-echo')
      .set('Content-Type', 'application/json')
      .send('{"invalid": json string');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_JSON');
    expect(res.body.error.message).toContain('malformed JSON');
  });

  it('should handle non-Error thrown objects safely', async () => {
    const res = await request(app).get('/test-non-error');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body.error.message).toBe('string primitive error');
  });
});
