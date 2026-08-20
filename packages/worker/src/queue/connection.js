import IORedis from 'ioredis';

let connection;

export function getRedisConnection() {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // required by BullMQ
    });
  }
  return connection;
}

export async function closeRedisConnection() {
  await connection?.quit();
}
