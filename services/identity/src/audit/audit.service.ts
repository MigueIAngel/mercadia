import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { auditEvents } from '../db/schema.js';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export type AuditAction =
  | 'register'
  | 'login'
  | 'login_failed'
  | 'login_locked'
  | 'login_google'
  | 'login_demo'
  | 'logout'
  | 'refresh_reuse_detected'
  | 'session_revoked'
  | 'password_changed'
  | '2fa_enabled'
  | '2fa_disabled'
  | '2fa_failed'
  | 'recovery_code_used'
  | 'store_opened'
  | 'admin_user_updated'
  | 'admin_store_updated';

/** Append-only security log, visible to each user (their own) and to admins. */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(
    action: AuditAction,
    userId: string | null,
    meta: RequestMeta = {},
    metadata: Record<string, unknown> = {},
    actorId?: string,
  ) {
    await this.db.insert(auditEvents).values({
      action,
      userId,
      actorId: actorId ?? userId,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
      metadata,
    });
  }

  list(filter: { userId?: string; action?: string }, limit = 50) {
    const conditions: SQL[] = [];
    if (filter.userId) conditions.push(eq(auditEvents.userId, filter.userId));
    if (filter.action) conditions.push(eq(auditEvents.action, filter.action));
    return this.db
      .select()
      .from(auditEvents)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditEvents.id))
      .limit(limit);
  }
}
