import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { z } from 'zod';
import { validateRequest } from '../src/middlewares/validate.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { requestIdMiddleware } from '../src/middlewares/request-id.js';

describe('Request Validation Middleware', () => {
  function createValidationApp(): Express {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(express.json());

    const testBodySchema = z.object({
      username: z.string().min(3).max(20),
      age: z.number().int().min(18),
      email: z.string().email()
    });

    const testQuerySchema = z.object({
      page: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().min(1)),
      limit: z.string().optional()
    });

    const testParamsSchema = z.object({
      id: z.string().uuid()
    });

    app.post(
      '/users',
      validateRequest({ body: testBodySchema }),
      (req, res) => {
        res.status(201).json({ user: req.body });
      }
    );

    app.get(
      '/items',
      validateRequest({ query: testQuerySchema }),
      (req, res) => {
        res.status(200).json({ query: req.query });
      }
    );

    app.get(
      '/items/:id',
      validateRequest({ params: testParamsSchema }),
      (req, res) => {
        res.status(200).json({ id: req.params['id'] });
      }
    );

    app.use(errorHandler);
    return app;
  }

  const app = createValidationApp();

  it('should pass validation with valid body', async () => {
    const res = await request(app)
      .post('/users')
      .send({
        username: 'john_doe',
        age: 25,
        email: 'john@example.com'
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      username: 'john_doe',
      age: 25,
      email: 'john@example.com'
    });
  });

  it('should reject invalid body with 400 and detail list', async () => {
    const res = await request(app)
      .post('/users')
      .send({
        username: 'j',
        age: 15,
        email: 'not-an-email'
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveLength(3);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain('username');
    expect(fields).toContain('age');
    expect(fields).toContain('email');
  });

  it('should validate query parameters', async () => {
    const res = await request(app).get('/items?page=2');
    expect(res.status).toBe(200);
    expect(res.body.query.page).toBe(2);
  });

  it('should reject invalid query parameters', async () => {
    const res = await request(app).get('/items?page=0');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate route params (UUID)', async () => {
    const validUuid = '018e6a32-7f22-7901-b28f-1a98234bc501';
    const res = await request(app).get(`/items/${validUuid}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(validUuid);
  });

  it('should reject invalid route params', async () => {
    const res = await request(app).get('/items/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
