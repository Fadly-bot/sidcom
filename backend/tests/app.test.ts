import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Application Infrastructure & Security Headers', () => {
  const app = createApp();

  it('should attach x-request-id to response headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers).toHaveProperty('x-request-id');
    expect(typeof res.headers['x-request-id']).toBe('string');
    expect(res.headers['x-request-id'].length).toBeGreaterThanOrEqual(8);
  });

  it('should preserve and sanitize client-provided x-request-id', async () => {
    const customId = 'client-req-12345678';
    const res = await request(app).get('/health').set('x-request-id', customId);
    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('should apply Helmet security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
    expect(res.headers).toHaveProperty('x-frame-options', 'SAMEORIGIN');
    expect(res.headers).toHaveProperty('content-security-policy');
  });

  it('should disable x-powered-by header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });

  it('should handle undefined route with 404 NotFoundError', async () => {
    const res = await request(app).get('/api/v1/non-existent-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('Route');
    expect(res.body.error).toHaveProperty('requestId');
  });

  it('should handle CORS preflight', async () => {
    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('should reject requests from unauthorized CORS origins', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://unauthorized-evil-site.com');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body.error.message).toContain('CORS policy does not allow access');
  });
});
