/**
 * Demo bundle: every NestJS service plus the gateway in ONE Node process, so the whole API
 * fits a single free Render instance (512 MB). Each service keeps its own module, database and
 * event consumer group, exactly as when they run as separate containers; only the process is
 * shared. The gateway listens on $PORT, the services on internal ports.
 *
 * Environment (see render.yaml): DATABASE_URL (one Neon/Postgres server; a database per
 * service is created here if missing), MONGODB_URI, REDIS_URL, INTERNAL_API_KEY, AI_URL…
 */
import pg from 'pg';

const env = process.env;
const PORTS = { identity: 4101, catalog: 4102, orders: 4103, payments: 4104, fulfillment: 4105, engagement: 4106 };
const POSTGRES_SERVICES = ['identity', 'orders', 'payments', 'fulfillment'];
const local = (service) => `http://127.0.0.1:${PORTS[service]}`;

function setDefault(key, value) {
  if (env[key] === undefined || env[key] === '') env[key] = value;
}

/** postgres://…/neondb?sslmode=require → same server, database `name`. */
function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

async function ensureDatabases() {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const admin = new pg.Client({ connectionString: env.DATABASE_URL });
  await admin.connect();
  try {
    const { rows } = await admin.query('SELECT datname FROM pg_database');
    const existing = new Set(rows.map((r) => r.datname));
    for (const name of POSTGRES_SERVICES) {
      if (!existing.has(name)) {
        await admin.query(`CREATE DATABASE "${name}"`);
        console.log(`created database ${name}`);
      }
    }
  } finally {
    await admin.end();
  }
}

function configure() {
  setDefault('NODE_ENV', 'production');
  for (const [service, port] of Object.entries(PORTS)) {
    const S = service.toUpperCase();
    setDefault(`${S}_PORT`, String(port));
    if (POSTGRES_SERVICES.includes(service))
      setDefault(`${S}_DATABASE_URL`, withDatabase(env.DATABASE_URL, service));
    setDefault(`GATEWAY_${S}_URL`, local(service));
  }
  // Service-to-service URLs inside the process.
  setDefault('JWKS_URL', `${local('identity')}/.well-known/jwks.json`);
  setDefault('IDENTITY_URL', local('identity'));
  setDefault('CATALOG_URL', local('catalog'));
  setDefault('ORDERS_URL', local('orders'));
  setDefault('PAYMENTS_URL', local('payments'));
  setDefault('FULFILLMENT_URL', local('fulfillment'));
  setDefault('ENGAGEMENT_URL', local('engagement'));
  setDefault('GATEWAY_PORT', env.PORT ?? '4000');
  if (env.AI_URL) setDefault('GATEWAY_AI_URL', env.AI_URL);
  // Postgres pools share one small server: keep them modest.
  setDefault('PG_POOL_MAX', '4');
}

const started = Date.now();
configure();
await ensureDatabases();

// Order matters: identity first (JWKS), catalog before orders (quotes), gateway last.
const services = [
  ['identity', '../../services/identity/dist/main.js', 'startIdentity'],
  ['catalog', '../../services/catalog/dist/main.js', 'startCatalog'],
  ['fulfillment', '../../services/fulfillment/dist/main.js', 'startFulfillment'],
  ['orders', '../../services/orders/dist/main.js', 'startOrders'],
  ['payments', '../../services/payments/dist/main.js', 'startPayments'],
  ['engagement', '../../services/engagement/dist/main.js', 'startEngagement'],
  ['gateway', '../../services/gateway/dist/main.js', 'startGateway'],
];
const apps = [];
for (const [name, path, fn] of services) {
  const mod = await import(new URL(path, import.meta.url).href);
  apps.push(await mod[fn]());
  console.log(`${name} up (${Math.round((Date.now() - started) / 1000)} s)`);
}
const mb = Math.round(process.memoryUsage().rss / 1024 / 1024);
console.log(`Mercadia API bundle ready in ${Math.round((Date.now() - started) / 1000)} s, RSS ${mb} MB`);

async function shutdown() {
  for (const app of apps.reverse()) await app.close().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
