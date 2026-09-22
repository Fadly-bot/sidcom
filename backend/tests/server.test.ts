import { describe, it, expect } from 'vitest';
import { startServer } from '../src/server.js';
import http from 'http';

describe('Server Lifecycle', () => {
  it('should start HTTP server and close cleanly', async () => {
    const server = startServer();
    expect(server).toBeDefined();

    // Wait until server is listening
    if (!server.listening) {
      await new Promise<void>((resolve) => server.once('listening', resolve));
    }

    expect(server.listening).toBe(true);

    const address = server.address();
    expect(address).toBeDefined();

    // Verify raw HTTP GET request to /health
    if (address && typeof address === 'object') {
      const { port } = address;
      const resData = await new Promise<string>((resolve, reject) => {
        http
          .get(`http://127.0.0.1:${port}/health`, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve(data));
          })
          .on('error', reject);
      });

      const parsed = JSON.parse(resData);
      expect(parsed.status).toBe('ok');
    }

    // Close server
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    expect(server.listening).toBe(false);
  });
});
