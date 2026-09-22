import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { AuthenticationError } from '../errors/app-error.js';

export interface UserJwtPayload {
  userId: string;
  email: string;
}

export function generateAccessToken(payload: UserJwtPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN as any
  });
}

export function verifyAccessToken(token: string): UserJwtPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as jwt.JwtPayload & UserJwtPayload;
    if (!decoded.userId || !decoded.email) {
      throw new AuthenticationError('Invalid token claims');
    }
    return {
      userId: decoded.userId,
      email: decoded.email
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Access token has expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid access token');
    }
    throw err;
  }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
