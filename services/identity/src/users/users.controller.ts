import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { verify } from '@node-rs/argon2';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { CurrentUser, Internal, type AuthUser } from '@mercadia/service-kit';
import { AuditService, type RequestMeta } from '../audit/audit.service.js';
import { CONFIG, type IdentityConfig } from '../config.js';
import { hashPassword } from '../auth/auth.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { DB, type Database } from '../db/database.module.js';
import { users } from '../db/schema.js';
import { Meta } from '../request-meta.js';

const AVATAR_HOSTS = ['res.cloudinary.com', 'lh3.googleusercontent.com'];

class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional({ enum: ['es', 'en'] })
  @IsOptional()
  @IsIn(['es', 'en'])
  locale?: string;

  @ApiPropertyOptional({ enum: ['COP', 'USD'] })
  @IsOptional()
  @IsIn(['COP', 'USD'])
  currency?: string;

  /** A photo uploaded to our Cloudinary (or the Google one); null removes it. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ protocols: ['https'], require_protocol: true, host_whitelist: AVATAR_HOSTS })
  @MaxLength(500)
  avatarUrl?: string | null;
}

class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/)
  newPassword: string;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  private readonly cloudinary?: { cloudName: string; apiKey: string; apiSecret: string };

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) config: IdentityConfig,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {
    const match = config.cloudinaryUrl?.match(/^cloudinary:\/\/(\d+):([^@]+)@(.+)$/);
    if (match) this.cloudinary = { apiKey: match[1], apiSecret: match[2], cloudName: match[3] };
  }

  private async load(id: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    if (!user) throw new NotFoundException();
    return user;
  }

  @Get('me')
  async me(@CurrentUser() current: AuthUser) {
    return this.tokens.publicUser(await this.load(current.sub));
  }

  @Patch('me')
  async update(@CurrentUser() current: AuthUser, @Body() dto: UpdateProfileDto) {
    const cloud = dto.avatarUrl && new URL(dto.avatarUrl);
    if (
      cloud &&
      cloud.hostname === 'res.cloudinary.com' &&
      !cloud.pathname.startsWith(`/${this.cloudinary?.cloudName}/`)
    ) {
      throw new BadRequestException('The photo must be uploaded to Mercadia');
    }
    const [user] = await this.db
      .update(users)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(users.id, current.sub))
      .returning();
    return this.tokens.publicUser(user);
  }

  /**
   * Signed direct upload: the browser sends the photo straight to Cloudinary, which stores it
   * as `mercadia/avatars/<user id>` (a new photo replaces the old one).
   */
  @Post('me/avatar/signature')
  @HttpCode(200)
  avatarSignature(@CurrentUser() current: AuthUser) {
    if (!this.cloudinary) throw new ServiceUnavailableException('Photo uploads are not configured');
    const params = {
      folder: 'mercadia/avatars',
      overwrite: 'true',
      public_id: current.sub,
      timestamp: String(Math.round(Date.now() / 1000)),
    };
    // Cloudinary's signature: sha1 of the sorted parameters followed by the API secret.
    const payload = Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return {
      url: `https://api.cloudinary.com/v1_1/${this.cloudinary.cloudName}/image/upload`,
      apiKey: this.cloudinary.apiKey,
      ...params,
      signature: createHash('sha1')
        .update(payload + this.cloudinary.apiSecret)
        .digest('hex'),
    };
  }

  @Post('me/password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() current: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Meta() meta: RequestMeta,
  ) {
    const user = await this.load(current.sub);
    if (user.passwordHash && !(await verify(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Current password is wrong');
    }
    await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(dto.newPassword), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    // Changing the password signs out every other device.
    await this.tokens.revokeAll(user.id);
    await this.audit.record('password_changed', user.id, meta);
  }

  @Get('me/sessions')
  sessions(@CurrentUser() current: AuthUser) {
    return this.tokens.sessions(current.sub);
  }

  @Delete('me/sessions/:familyId')
  @HttpCode(204)
  async revoke(
    @CurrentUser() current: AuthUser,
    @Param('familyId', ParseUUIDPipe) familyId: string,
    @Meta() meta: RequestMeta,
  ) {
    await this.tokens.revokeSession(current.sub, familyId);
    await this.audit.record('session_revoked', current.sub, meta, { familyId });
  }

  @Get('me/security-log')
  securityLog(@CurrentUser() current: AuthUser) {
    return this.audit.list({ userId: current.sub }, 30);
  }

  /** Contact details for other services (notifications, orders). */
  @Internal()
  @Post('internal/lookup')
  @HttpCode(200)
  async lookup(@Body() body: { ids: string[] }) {
    if (!Array.isArray(body.ids) || body.ids.length === 0) return [];
    return this.db
      .select({ id: users.id, email: users.email, name: users.name, locale: users.locale })
      .from(users)
      .where(inArray(users.id, body.ids.slice(0, 200)));
  }
}
