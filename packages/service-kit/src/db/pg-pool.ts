import { Logger } from '@nestjs/common';
import pg from 'pg';

const logger = new Logger('Postgres');

/**
 * A pg pool that survives dropped server connections. Serverless Postgres (Neon) and poolers
 * close connections at will; without listeners, pg emits an unhandled `error` event on the
 * client and takes the whole process down. With them, the affected query fails and the pool
 * opens a new connection.
 */
export function createPgPool(connectionString: string, service: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    // The demo bundle runs several pools against one small server: it lowers this.
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });
  pool.on('error', (error) => logger.warn(`${service}: idle connection lost (${error.message})`));
  pool.on('connect', (client) =>
    client.on('error', (error) => logger.warn(`${service}: connection lost (${error.message})`)),
  );
  return pool;
}
