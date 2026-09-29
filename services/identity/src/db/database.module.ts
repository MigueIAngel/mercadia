import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { EventBus, HealthRegistry, OutboxRelay } from '@mercadia/service-kit';
import { CONFIG, type IdentityConfig } from '../config.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;
export const DB = Symbol('DB');
export const POOL = Symbol('POOL');

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));

@Injectable()
class DatabaseLifecycle implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Database');
  private relay?: OutboxRelay;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(POOL) private readonly pool: pg.Pool,
    private readonly bus: EventBus,
    private readonly health: HealthRegistry,
  ) {}

  async onModuleInit() {
    await migrate(this.db, { migrationsFolder: MIGRATIONS });
    this.logger.log('migrations applied');
    this.health.add('postgres', () => this.pool.query('SELECT 1'));
    this.relay = new OutboxRelay(this.pool, this.bus);
    this.relay.start();
  }

  async onApplicationShutdown() {
    this.relay?.stop();
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: POOL,
      inject: [CONFIG],
      useFactory: (config: IdentityConfig) =>
        new pg.Pool({
          connectionString: config.databaseUrl,
          // The demo bundle runs four pools against one small server: it lowers this.
          max: Number(process.env.PG_POOL_MAX ?? 10),
        }),
    },
    { provide: DB, inject: [POOL], useFactory: (pool: pg.Pool) => drizzle(pool, { schema }) },
    DatabaseLifecycle,
  ],
  exports: [DB, POOL],
})
export class DatabaseModule {}
