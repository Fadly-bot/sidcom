import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env if present
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .default('4000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(65535)),
  HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z
    .string()
    .default('/api/v1')
    .refine((val) => val.startsWith('/'), {
      message: 'API_PREFIX must start with a slash (/)'
    }),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16).default('karsa_dev_access_secret_32_chars_long'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z
    .string()
    .default('7')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1))
});

export type EnvConfig = z.infer<typeof envSchema>;

export function parseConfig(env: Record<string, string | undefined> = process.env): EnvConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errorDetails}`);
  }
  return result.data;
}

export const config = parseConfig();
