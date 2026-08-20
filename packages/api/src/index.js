import 'dotenv/config';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { getPool, closePool } from './db/pool.js';
import { closeQueue } from './queue/queue.js';
import { bootstrapDevKeys } from './lib/apiKeys.js';

const port = Number(process.env.API_PORT || 3000);

async function main() {
  await getPool().query('SELECT 1'); // fail fast if Postgres is unreachable
  if (process.env.NODE_ENV !== 'production') {
    await bootstrapDevKeys();
  }

  const app = createApp();
  const server = app.listen(port, () => {
    logger.info({ port }, 'api listening');
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await closeQueue();
      await closePool();
      process.exit(0);
    });
    // Force-exit if graceful shutdown hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
