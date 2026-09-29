import pg from 'pg';

// Runs before the app module is imported: its config is read at import time.
const base = process.env.TEST_DATABASE_URL ?? 'postgres://mercadia:mercadia@localhost:5433';
process.env.IDENTITY_DATABASE_URL = `${base}/identity_test`;
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/14';
process.env.CONSUME_EVENTS = 'false';
process.env.LOG_LEVEL = 'silent';

export async function resetDatabase() {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS identity_test WITH (FORCE)');
  await admin.query('CREATE DATABASE identity_test');
  await admin.end();
}
