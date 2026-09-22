import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import { IDatabase, getDb } from '../db/index.js';
import { config } from '../config/index.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken
} from './token.js';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError
} from '../errors/app-error.js';

export interface UserRecord {
  id: string;
  email: string;
  display_name: string;
  profile_timezone: string;
  created_at: string;
  updated_at: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface AuthResult {
  user: UserRecord;
  tokens: AuthTokens;
}

export class AuthService {
  private dbInstance: IDatabase | undefined;

  constructor(db?: IDatabase) {
    this.dbInstance = db;
  }

  private get db(): IDatabase {
    return this.dbInstance ?? getDb();
  }

  async register(params: {
    email: string;
    password: string;
    displayName: string;
    timezone?: string;
  }): Promise<AuthResult> {
    const emailNormalized = params.email.toLowerCase().trim();

    // Check if email already registered
    const existing = await this.db.query(
      'SELECT id FROM users WHERE email = $1;',
      [emailNormalized]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError('Email is already registered');
    }

    const passwordHash = await bcryptjs.hash(params.password, 10);
    const userId = `usr_${crypto.randomUUID()}`;
    const timezone = params.timezone ?? 'Asia/Jakarta';

    // Insert user
    await this.db.query(
      `
      INSERT INTO users (id, email, password_hash, display_name, profile_timezone)
      VALUES ($1, $2, $3, $4, $5);
      `,
      [userId, emailNormalized, passwordHash, params.displayName.trim(), timezone]
    );

    // Initialize user streak ledger
    await this.db.query(
      `
      INSERT INTO user_streaks (user_id, current_streak, longest_streak, banked_freezes)
      VALUES ($1, 0, 0, 0)
      ON CONFLICT (user_id) DO NOTHING;
      `,
      [userId]
    );

    const user = await this.getUserById(userId);
    const tokens = await this.issueTokenPair(userId, emailNormalized);

    return { user, tokens };
  }

  async login(params: { email: string; password: string }): Promise<AuthResult> {
    const emailNormalized = params.email.toLowerCase().trim();

    const res = await this.db.query<{
      id: string;
      email: string;
      password_hash: string;
      display_name: string;
      profile_timezone: string;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM users WHERE email = $1;', [emailNormalized]);

    const userRaw = res.rows[0];
    if (!userRaw) {
      // Mitigate user enumeration timing attack by performing dummy hash check
      await bcryptjs.compare(params.password, '$2b$10$invalidhashstringpaddingforfaketimingcompare.');
      throw new AuthenticationError('Invalid email or password');
    }

    const isMatch = await bcryptjs.compare(params.password, userRaw.password_hash);
    if (!isMatch) {
      throw new AuthenticationError('Invalid email or password');
    }

    const tokens = await this.issueTokenPair(userRaw.id, userRaw.email);

    return {
      user: {
        id: userRaw.id,
        email: userRaw.email,
        display_name: userRaw.display_name,
        profile_timezone: userRaw.profile_timezone,
        created_at: userRaw.created_at,
        updated_at: userRaw.updated_at
      },
      tokens
    };
  }

  async rotateRefreshToken(rawToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(rawToken);

    const tokenRes = await this.db.query<{
      id: string;
      user_id: string;
      expires_at: string;
      revoked_at: string | null;
      replaced_by_token_id: string | null;
    }>('SELECT * FROM refresh_tokens WHERE token_hash = $1;', [tokenHash]);

    const record = tokenRes.rows[0];
    if (!record) {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Token reuse detection: if a revoked or already-replaced token is presented, invalidate ALL user tokens!
    if (record.revoked_at || record.replaced_by_token_id) {
      await this.revokeAllUserTokens(record.user_id);
      throw new AuthenticationError(
        'Refresh token reuse detected. All active sessions have been revoked for security.'
      );
    }

    // Check expiration
    if (new Date(record.expires_at) < new Date()) {
      await this.db.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1;',
        [record.id]
      );
      throw new AuthenticationError('Refresh token has expired');
    }

    // Get user details
    const userRes = await this.db.query<{ email: string }>(
      'SELECT email FROM users WHERE id = $1;',
      [record.user_id]
    );
    const user = userRes.rows[0];
    if (!user) {
      throw new AuthenticationError('User associated with token no longer exists');
    }

    // Create new token pair
    const newRawRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashToken(newRawRefreshToken);
    const newTokenId = `rt_${crypto.randomUUID()}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.REFRESH_TOKEN_EXPIRES_DAYS);

    // Atomic rotation: mark old token as replaced and insert new token
    await this.db.query(
      `
      UPDATE refresh_tokens 
      SET revoked_at = NOW(), replaced_by_token_id = $1 
      WHERE id = $2;
      `,
      [newTokenId, record.id]
    );

    await this.db.query(
      `
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4);
      `,
      [newTokenId, record.user_id, newRefreshTokenHash, expiresAt.toISOString()]
    );

    const accessToken = generateAccessToken({
      userId: record.user_id,
      email: user.email
    });

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      expiresInSeconds: 15 * 60
    };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1;',
      [tokenHash]
    );
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL;',
      [userId]
    );
  }

  async getUserById(userId: string): Promise<UserRecord> {
    const res = await this.db.query<UserRecord>(
      `
      SELECT id, email, display_name, profile_timezone, created_at, updated_at
      FROM users
      WHERE id = $1;
      `,
      [userId]
    );
    const user = res.rows[0];
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return user;
  }

  private async issueTokenPair(userId: string, email: string): Promise<AuthTokens> {
    const accessToken = generateAccessToken({ userId, email });
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const tokenId = `rt_${crypto.randomUUID()}`;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.REFRESH_TOKEN_EXPIRES_DAYS);

    await this.db.query(
      `
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4);
      `,
      [tokenId, userId, tokenHash, expiresAt.toISOString()]
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresInSeconds: 15 * 60
    };
  }
}
