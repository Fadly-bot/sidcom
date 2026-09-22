import { describe, it, expect } from 'vitest';
import { parseConfig } from '../src/config/index.js';

describe('Configuration Validation', () => {
  it('should parse valid configuration with defaults', () => {
    const parsed = parseConfig({
      NODE_ENV: 'test',
      PORT: '5000',
      HOST: '127.0.0.1'
    });

    expect(parsed.NODE_ENV).toBe('test');
    expect(parsed.PORT).toBe(5000);
    expect(parsed.HOST).toBe('127.0.0.1');
    expect(parsed.API_PREFIX).toBe('/api/v1');
  });

  it('should throw error when PORT is invalid string', () => {
    expect(() =>
      parseConfig({
        PORT: 'invalid-port'
      })
    ).toThrow(/Configuration validation failed/);
  });

  it('should throw error when PORT is out of valid port range', () => {
    expect(() =>
      parseConfig({
        PORT: '999999'
      })
    ).toThrow(/Configuration validation failed/);
  });

  it('should throw error when NODE_ENV is invalid', () => {
    expect(() =>
      parseConfig({
        NODE_ENV: 'invalid_env' as unknown as string
      })
    ).toThrow(/Configuration validation failed/);
  });

  it('should throw error when API_PREFIX does not start with slash', () => {
    expect(() =>
      parseConfig({
        API_PREFIX: 'api/v1'
      })
    ).toThrow(/Configuration validation failed/);
  });
});
