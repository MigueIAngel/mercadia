import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AccessTokenClaims, Role } from '@mercadia/contracts';
import { AuditService, type RequestMeta } from '../audit/audit.service.js';
import { CONFIG, type IdentityConfig } from '../config.js';
import { randomToken, sha256 } from '../crypto.js';
import { DB, type Database } from '../db/database.module.js';
import { refreshTokens, stores, users, type User } from '../db/schema.js';
import { KeysService } from '../keys/keys.service.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  locale: string;
  currency: string;
  roles: Role[];
  totpEnabled: boolean;
  store: { id: string; slug: string; name: string } | null;
}

@Injectable()
export class TokensService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: IdentityConfig,
    private readonly keys: KeysService,
    private readonly audit: AuditService,
  ) {}

  async publicUser(user: User): Promise<PublicUser> {
    const [store] = await this.db
      .select({ id: stores.id, slug: stores.slug, name: stores.name })
      .from(stores)
      .where(eq(stores.ownerId, user.id));
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      currency: user.currency,
      roles: user.roles as Role[],
      totpEnabled: user.totpEnabled,
      store: store ?? null,
    };
  }

  /** Starts a new session (a new refresh-token family). */
  async issue(user: User, meta: RequestMeta, familyId: string = randomUUID()): Promise<AuthTokens> {
    const profile = await this.publicUser(user);
    const claims: AccessTokenClaims = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: profile.roles,
      ...(profile.store && { storeId: profile.store.id }),
      ...(user.avatarUrl && { picture: user.avatarUrl }),
    };
    const refreshToken = randomToken(48);
    await this.db.insert(refreshTokens).values({
      userId: user.id,
      familyId,
      tokenHash: sha256(refreshToken),
      userAgent: meta.userAgent?.slice(0, 300),
      ip: meta.ip,
      expiresAt: new Date(Date.now() + this.config.refreshTtlDays * 86_400_000),
    });
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return {
      accessToken: await this.keys.signAccessToken(claims),
      refreshToken,
      expiresIn: this.config.accessTtlSeconds,
      user: profile,
    };
  }

  /**
   * Rotation with reuse detection: a refresh token works exactly once. If an already
   * rotated token shows up again it was probably stolen, so the whole family is revoked.
   */
  async refresh(token: string, meta: RequestMeta): Promise<AuthTokens> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, sha256(token)));
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }
    if (row.rotatedAt) {
      await this.revokeFamily(row.familyId);
      await this.audit.record('refresh_reuse_detected', row.userId, meta, {
        familyId: row.familyId,
      });
      throw new UnauthorizedException('Session revoked');
    }
    const [user] = await this.db.select().from(users).where(eq(users.id, row.userId));
    if (!user || user.status !== 'active') throw new UnauthorizedException('Account disabled');

    const rotated = await this.db
      .update(refreshTokens)
      .set({ rotatedAt: new Date() })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.rotatedAt)))
      .returning({ id: refreshTokens.id });
    if (rotated.length === 0) throw new UnauthorizedException('Session already refreshed');
    return this.issue(user, meta, row.familyId);
  }

  async revokeFamily(familyId: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  async revokeByToken(token: string): Promise<string | null> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, sha256(token)));
    if (!row) return null;
    await this.revokeFamily(row.familyId);
    return row.userId;
  }

  async revokeAll(userId: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  /** Active sessions: the newest live token of each family. */
  async sessions(userId: string) {
    const rows = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt),
          isNull(refreshTokens.rotatedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      );
    return rows
      .map((r) => ({
        familyId: r.familyId,
        userAgent: r.userAgent,
        ip: r.ip,
        lastUsedAt: r.createdAt,
        expiresAt: r.expiresAt,
      }))
      .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime());
  }

  async revokeSession(userId: string, familyId: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.familyId, familyId)));
  }
}
