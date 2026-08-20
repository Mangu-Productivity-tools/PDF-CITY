import http from 'node:http';
import { getPool } from './db/pool.js';
import { getRedisConnection } from './queue/connection.js';
import { register } from './metrics.js';

export function startHealthServer(port) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok' }));
    }
    if (req.url === '/ready') {
      const checks = {};
      try {
        await getPool().query('SELECT 1');
        checks.postgres = true;
      } catch {
        checks.postgres = false;
      }
      try {
        checks.redis = (await getRedisConnection().ping()) === 'PONG';
      } catch {
        checks.redis = false;
      }
      const ready = Object.values(checks).every(Boolean);
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: ready ? 'ready' : 'not_ready', checks }));
    }
    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': register.contentType });
      return res.end(await register.metrics());
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port);
  return server;
}
