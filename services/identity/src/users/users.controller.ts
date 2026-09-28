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
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { verify } from '@node-rs/argon2';
import { IsIn, IsOptional, IsString, IsUrl, Length, Matches } from 'class-validator';
import { eq, inArray } from 'drizzle-orm';
import { CurrentUser, Internal, type AuthUser } from '@mercadia/service-kit';
import { AuditService, type RequestMeta } from '../audit/audit.service.js';
import { hashPassword } from '../auth/auth.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { DB, type Database } from '../db/database.module.js';
import { users } from '../db/schema.js';
import { Meta } from '../request-meta.js';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
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
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

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
    const [user] = await this.db
      .update(users)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(users.id, current.sub))
      .returning();
    return this.tokens.publicUser(user);
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
