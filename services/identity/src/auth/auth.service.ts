import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { jwtVerify } from 'jose';
import { JWT_ISSUER } from '@mercadia/contracts';
import { ADMIN, BUYERS, SELLERS } from '@mercadia/demo-data';
import { EventBus, stageEvent } from '@mercadia/service-kit';
import { AuditService, type RequestMeta } from '../audit/audit.service.js';
import { CONFIG, type IdentityConfig } from '../config.js';
import { sha256 } from '../crypto.js';
import { DB, POOL, type Database } from '../db/database.module.js';
import { recoveryCodes, users, type User } from '../db/schema.js';
import { KeysService } from '../keys/keys.service.js';
import type pg from 'pg';
import type { RegisterDto } from './dto/auth.dto.js';
import { GoogleService } from './google.service.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { TokensService, type AuthTokens } from './tokens.service.js';
import { TotpService } from './totp.service.js';

export type LoginResult = AuthTokens | { mfaRequired: true; mfaToken: string };

// Argon2id, OWASP 2024 baseline (19 MiB, 2 iterations).
export const hashPassword = (password: string) =>
  hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

// A real hash, so unknown emails take as long as wrong passwords (no user enumeration).
const DUMMY_HASH = hashPassword('not-a-real-password');

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: IdentityConfig,
    private readonly tokens: TokensService,
    private readonly keys: KeysService,
    private readonly throttle: LoginThrottleService,
    private readonly totp: TotpService,
    private readonly google: GoogleService,
    private readonly audit: AuditService,
    private readonly bus: EventBus,
  ) {}

  private findByEmail(email: string) {
    return this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .then((rows) => rows[0]);
  }

  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthTokens> {
    if (await this.findByEmail(dto.email)) throw new ConflictException('Email already registered');
    const passwordHash = await hashPassword(dto.password);
    const client = await this.pool.connect();
    let user: User;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string }>(
        'INSERT INTO users (email, name, password_hash, locale) VALUES ($1, $2, $3, $4) RETURNING id',
        [dto.email.toLowerCase(), dto.name.trim(), passwordHash, dto.locale ?? 'es'],
      );
      await stageEvent(
        client,
        this.bus.build('user.registered', {
          userId: rows[0].id,
          email: dto.email.toLowerCase(),
          name: dto.name.trim(),
          locale: dto.locale ?? 'es',
        }),
      );
      await client.query('COMMIT');
      user = (await this.findByEmail(dto.email))!;
    } catch (error) {
      await client.query('ROLLBACK');
      if (String(error).includes('users_email_key'))
        throw new ConflictException('Email already registered');
      throw error;
    } finally {
      client.release();
    }
    await this.audit.record('register', user.id, meta);
    return this.tokens.issue(user, meta);
  }

  async login(email: string, password: string, meta: RequestMeta): Promise<LoginResult> {
    await this.throttle.assertNotLocked(email);
    const user = await this.findByEmail(email);
    const valid = await verify(user?.passwordHash ?? (await DUMMY_HASH), password).catch(
      () => false,
    );
    if (!user || !user.passwordHash || !valid) {
      const locked = await this.throttle.registerFailure(email);
      await this.audit.record(locked ? 'login_locked' : 'login_failed', user?.id ?? null, meta, {
        email,
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status !== 'active') throw new ForbiddenException('Account suspended');
    await this.throttle.reset(email);
    return this.completeLogin(user, meta, 'login');
  }

  private async completeLogin(
    user: User,
    meta: RequestMeta,
    action: 'login' | 'login_google' | 'login_demo',
  ): Promise<LoginResult> {
    if (user.totpEnabled) {
      return { mfaRequired: true, mfaToken: await this.keys.signMfaToken(user.id) };
    }
    await this.audit.record(action, user.id, meta);
    return this.tokens.issue(user, meta);
  }

  async loginWithMfa(mfaToken: string, code: string, meta: RequestMeta): Promise<AuthTokens> {
    let userId: string;
    try {
      const { payload } = await jwtVerify(mfaToken, await this.keys.publicKey(), {
        issuer: JWT_ISSUER,
        audience: 'mercadia-mfa',
      });
      userId = payload.sub!;
    } catch {
      throw new UnauthorizedException('Verification expired, sign in again');
    }
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user?.totpSecret) throw new UnauthorizedException();
    await this.throttle.assertNotLocked(user.email);

    if (await this.totp.check(user.totpSecret, code)) {
      await this.throttle.reset(user.email);
      await this.audit.record('login', user.id, meta, { mfa: 'totp' });
      return this.tokens.issue(user, meta);
    }
    const used = await this.db
      .update(recoveryCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(recoveryCodes.userId, user.id),
          eq(recoveryCodes.codeHash, sha256(code.toLowerCase())),
          isNull(recoveryCodes.usedAt),
        ),
      )
      .returning({ id: recoveryCodes.id });
    if (used.length) {
      await this.audit.record('recovery_code_used', user.id, meta);
      return this.tokens.issue(user, meta);
    }
    await this.throttle.registerFailure(user.email);
    await this.audit.record('2fa_failed', user.id, meta);
    throw new UnauthorizedException('Invalid verification code');
  }

  async loginWithGoogle(
    code: string,
    redirectUri: string,
    meta: RequestMeta,
  ): Promise<LoginResult> {
    const profile = await this.google.exchange(code, redirectUri);
    let [user] = await this.db.select().from(users).where(eq(users.googleSub, profile.sub));
    if (!user) {
      const existing = await this.findByEmail(profile.email);
      if (existing) {
        // Google verified the email, so linking to the existing account is safe.
        [user] = await this.db
          .update(users)
          .set({ googleSub: profile.sub, avatarUrl: existing.avatarUrl ?? profile.picture })
          .where(eq(users.id, existing.id))
          .returning();
      } else {
        [user] = await this.db
          .insert(users)
          .values({
            email: profile.email.toLowerCase(),
            name: profile.name,
            googleSub: profile.sub,
            avatarUrl: profile.picture,
          })
          .returning();
        await this.bus.publish('user.registered', {
          userId: user.id,
          email: user.email,
          name: user.name,
          locale: user.locale,
        });
        await this.audit.record('register', user.id, meta, { provider: 'google' });
      }
    }
    if (user.status !== 'active') throw new ForbiddenException('Account suspended');
    return this.completeLogin(user, meta, 'login_google');
  }

  /** One-click access to the seeded demo accounts (disabled with DEMO_LOGIN=false). */
  async demoLogin(role: 'buyer' | 'seller' | 'admin', meta: RequestMeta): Promise<AuthTokens> {
    if (!this.config.demoLogin) throw new NotFoundException();
    const email = { buyer: BUYERS[0].email, seller: SELLERS[0].email, admin: ADMIN.email }[role];
    const user = await this.findByEmail(email);
    if (!user) throw new NotFoundException('Demo data not loaded yet');
    await this.audit.record('login_demo', user.id, meta, { role });
    return this.tokens.issue(user, meta);
  }

  async logout(refreshToken: string, meta: RequestMeta) {
    const userId = await this.tokens.revokeByToken(refreshToken);
    if (userId) await this.audit.record('logout', userId, meta);
  }

  async setupTotp(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (user.totpEnabled) throw new ConflictException('Two-factor authentication is already on');
    const { secret, otpauthUrl, qrCode, encrypted } = await this.totp.createSecret(user.email);
    await this.db.update(users).set({ totpSecret: encrypted }).where(eq(users.id, userId));
    return { secret, otpauthUrl, qrCode };
  }

  async enableTotp(userId: string, code: string, meta: RequestMeta) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user.totpSecret) throw new BadRequestException('Start the setup first');
    if (user.totpEnabled) throw new ConflictException('Two-factor authentication is already on');
    if (!(await this.totp.check(user.totpSecret, code))) {
      throw new BadRequestException('Invalid verification code');
    }
    const { codes, hashes } = this.totp.recoveryCodes();
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ totpEnabled: true }).where(eq(users.id, userId));
      await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
      await tx.insert(recoveryCodes).values(hashes.map((codeHash) => ({ userId, codeHash })));
    });
    await this.audit.record('2fa_enabled', userId, meta);
    return { recoveryCodes: codes };
  }

  async disableTotp(userId: string, code: string, meta: RequestMeta) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user.totpEnabled || !user.totpSecret)
      throw new BadRequestException('Two-factor authentication is off');
    if (!(await this.totp.check(user.totpSecret, code))) {
      throw new BadRequestException('Invalid verification code');
    }
    await this.db
      .update(users)
      .set({ totpEnabled: false, totpSecret: null })
      .where(eq(users.id, userId));
    await this.db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
    await this.audit.record('2fa_disabled', userId, meta);
  }
}
