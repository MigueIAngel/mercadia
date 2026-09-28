import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DEMO_PASSWORD, STORES, USERS } from '@mercadia/demo-data';
import { hashPassword } from '../auth/auth.service.js';
import { CONFIG, type IdentityConfig } from '../config.js';
import { DB, type Database } from '../db/database.module.js';
import { stores, users } from '../db/schema.js';

/**
 * Loads the demo accounts and stores when the database is empty. The free cloud database
 * can be wiped at any time, so every boot checks and refills it; ids are deterministic
 * and shared with the other services' seeds.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: IdentityConfig,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.seed) await this.seed();
  }

  async seed() {
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(users);
    if (n > 0) return;
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    await this.db.transaction(async (tx) => {
      await tx.insert(users).values(
        USERS.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          roles: u.roles,
          locale: u.locale,
          currency: u.locale === 'en' ? 'USD' : 'COP',
          passwordHash,
        })),
      );
      await tx.insert(stores).values(
        STORES.map((s) => ({
          id: s.id,
          ownerId: s.ownerId,
          name: s.name,
          slug: s.slug,
          city: s.city,
          description: s.description.es,
          accentColor: s.accent,
          payoutsEnabled: true,
        })),
      );
    });
    this.logger.log(`demo data loaded: ${USERS.length} users, ${STORES.length} stores`);
  }
}
