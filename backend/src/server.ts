import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { Server } from 'http';

function startServer(): Server {
  const app = createApp();

  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info(
      {
        port: config.PORT,
        host: config.HOST,
        env: config.NODE_ENV,
        prefix: config.API_PREFIX
      },
      `🚀 SIDCOM Backend API listening on http://${config.HOST}:${config.PORT}${config.API_PREFIX}`
    );
  });

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Gracefully shutting down HTTP server...`);
    server.close(() => {
      logger.info('HTTP server closed successfully.');
      process.exit(0);
    });

    // Force close after 10s timeout if hung
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled Promise Rejection detected');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught Exception detected. Shutting down...');
    shutdown('uncaughtException');
  });

  return server;
}

// Start only if executed directly
if (process.env['NODE_ENV'] !== 'test') {
  startServer();
}

export { startServer };
