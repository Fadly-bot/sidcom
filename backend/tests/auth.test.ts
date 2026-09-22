import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { createTestDatabase, IDatabase, setDb } from '../src/db/index.js';
import { migrateUp } from '../src/db/migrator.js';
import { AuthService } from '../src/auth/auth-service.js';
import { authLimiter } from '../src/routes/auth.js';
import { config } from '../src/config/index.js';

describe('Authentication & Authorization Security Suite', () => {
  let db: IDatabase;
  let app: ReturnType<typeof createApp>;
  let authService: AuthService;

  beforeAll(async () => {
    db = await createTestDatabase();
    setDb(db);
    await migrateUp(db);
    authService = new AuthService(db);
    app = createApp();
  });

  afterAll(async () => {
    setDb(null);
    await db.close();
  });

  beforeEach(() => {
    authLimiter.reset();
  });

  describe('User Registration', () => {
    it('should register a new user successfully with 201 status', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'alice@example.com',
          password: 'SecurePassword123!',
          displayName: 'Alice Pembelajar',
          timezone: 'Asia/Jakarta'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe('alice@example.com');
      expect(res.body.user.display_name).toBe('Alice Pembelajar');
      expect(res.body.user).not.toHaveProperty('password_hash');
      expect(res.body).toHaveProperty('accessToken');
      expect(res.headers['set-cookie']).toBeDefined();

      const cookies = res.headers['set-cookie'];
      const refreshCookie = cookies?.find((c: string) => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
    });

    it('should reject duplicate email registration with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'alice@example.com',
          password: 'AnotherPassword123!',
          displayName: 'Alice Clone'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('already registered');
    });

    it('should reject registration with password shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'short@example.com',
          password: 'short',
          displayName: 'Short Password'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const fields = res.body.error.details.map((d: { field: string }) => d.field);
      expect(fields).toContain('password');
    });

    it('should reject registration with malformed email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: 'SecurePassword123!',
          displayName: 'Bad Email'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('User Login & Credential Verification', () => {
    it('should log in with valid credentials and return tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'SecurePassword123!'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user.email).toBe('alice@example.com');
      expect(res.body.user).not.toHaveProperty('password_hash');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject login with wrong password (401)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'WrongPassword999!'
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(res.body.error.message).toContain('Invalid email or password');
    });

    it('should reject login for non-existent user with same generic error (anti-enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'ghost@example.com',
          password: 'AnyPassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(res.body.error.message).toContain('Invalid email or password');
    });
  });

  describe('Authentication Middleware & Token Verification', () => {
    let validAccessToken: string;
    let userId: string;

    beforeAll(async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'SecurePassword123!'
        });
      validAccessToken = loginRes.body.accessToken;
      userId = loginRes.body.user.id;
    });

    it('should allow access to protected /users/me with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${validAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(userId);
      expect(res.body.user.email).toBe('alice@example.com');
    });

    it('should reject request missing Authorization header (401)', async () => {
      const res = await request(app).get('/api/v1/users/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should reject malformed or tampered token (401)', async () => {
      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer tampered.token.here');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('should reject expired JWT access token (401)', async () => {
      const expiredToken = jwt.sign(
        { userId, email: 'alice@example.com' },
        config.JWT_ACCESS_SECRET,
        { expiresIn: -10 } // Expired 10 seconds ago
      );

      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(res.body.error.message).toContain('expired');
    });
  });

  describe('Refresh Token Rotation & Replay Attack Defense', () => {
    let initialRefreshToken: string;

    beforeAll(async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'SecurePassword123!'
        });

      const cookies = loginRes.headers['set-cookie'] as string[];
      const cookieStr = cookies?.find((c) => c.startsWith('refreshToken=')) || '';
      initialRefreshToken = cookieStr.split(';')[0]?.split('=')[1] || '';
    });

    it('should rotate refresh token and issue new access token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${initialRefreshToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.headers['set-cookie']).toBeDefined();

      const newCookies = res.headers['set-cookie'] as string[];
      const newCookieStr = newCookies?.find((c) => c.startsWith('refreshToken=')) || '';
      const newRefreshToken = newCookieStr.split(';')[0]?.split('=')[1] || '';
      expect(newRefreshToken).not.toBe(initialRefreshToken);

      // Replay Attack Test: replaying the old (consumed) refresh token MUST fail and invalidate all tokens!
      const replayRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${initialRefreshToken}`);

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.error.message).toContain('Refresh token reuse detected');

      // Subsequent attempt with new token should now ALSO be revoked due to family invalidation
      const subsequentRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${newRefreshToken}`);

      expect(subsequentRes.status).toBe(401);
    });
  });

  describe('User Logout', () => {
    it('should clear refresh cookie and revoke token upon logout', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'SecurePassword123!'
        });

      const cookies = loginRes.headers['set-cookie'] as string[];
      const cookieStr = cookies?.find((c) => c.startsWith('refreshToken=')) || '';
      const refreshToken = cookieStr.split(';')[0]?.split('=')[1] || '';

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `refreshToken=${refreshToken}`);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toContain('logged out');

      // Attempting to refresh with logged-out token must fail
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`);

      expect(refreshRes.status).toBe(401);
    });
  });

  describe('Authorization Boundary & User Isolation (Anti-IDOR)', () => {
    let userAToken: string;
    let userAId: string;
    let userBId: string;

    beforeAll(async () => {
      // Register User B
      const userBRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'bob@example.com',
          password: 'BobSecurePassword123!',
          displayName: 'Bob Pembelajar'
        });
      userBId = userBRes.body.user.id;

      // Log in as User A
      const userARes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'SecurePassword123!'
        });
      userAToken = userARes.body.accessToken;
      userAId = userARes.body.user.id;
    });

    it('should allow User A to access own private resource', async () => {
      const res = await request(app)
        .get(`/api/v1/users/${userAId}/data`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(userAId);
    });

    it('should forbid User A from accessing User B private resource (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/users/${userBId}/data`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('cannot access or modify another user');
    });
  });

  describe('Rate Limiting on Authentication Endpoints', () => {
    it('should rate limit brute force login attempts after 5 requests per minute', async () => {
      // Make 5 rapid login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'brute@example.com',
            password: `WrongPassword${i}`
          });
      }

      // 6th attempt must be rejected with 429 Too Many Requests
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'brute@example.com',
          password: 'WrongPassword6'
        });

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(res.headers).toHaveProperty('ratelimit-remaining', '0');
    });
  });
});
