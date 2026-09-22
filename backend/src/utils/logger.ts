import pino, { LoggerOptions } from 'pino';
import { config } from '../config/index.js';

const isProduction = config.NODE_ENV === 'production';
const isTest = config.NODE_ENV === 'test';

const options: LoggerOptions = {
  level: isTest ? 'silent' : config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'creditCard'
    ],
    censor: '[REDACTED]'
  },
  timestamp: pino.stdTimeFunctions.isoTime
};

if (!isProduction && !isTest) {
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  };
}

export const logger = pino(options);
