import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsOptional } from 'class-validator';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { ROLES } from '@mercadia/contracts';
import { CurrentUser, Roles, type AuthUser } from '@mercadia/service-kit';
import { AuditService, type RequestMeta } from '../audit/audit.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { DB, type Database } from '../db/database.module.js';
import { stores, users } from '../db/schema.js';
import { Meta } from '../request-meta.js';

class UpdateUserDto {
  @ApiPropertyOptional({ enum: ['active', 'suspended'] })
  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: string;

  @ApiPropertyOptional({ isArray: true, enum: ROLES })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ROLES, { each: true })
  roles?: string[];
}

class UpdateStoreStatusDto {
  @ApiPropertyOptional({ enum: ['active', 'suspended'] })
  @IsIn(['active', 'suspended'])
  status: string;
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  listUsers(@Query('search') search?: string) {
    return this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        roles: users.roles,
        status: users.status,
        totpEnabled: users.totpEnabled,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        search
          ? or(ilike(users.email, `%${search}%`), ilike(users.name, `%${search}%`))
          : undefined,
      )
      .orderBy(desc(users.createdAt))
      .limit(100);
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() admin: AuthUser,
    @Meta() meta: RequestMeta,
  ) {
    const [user] = await this.db
      .update(users)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!user) throw new NotFoundException();
    if (dto.status === 'suspended') await this.tokens.revokeAll(id);
    await this.audit.record('admin_user_updated', id, meta, { ...dto }, admin.sub);
    return this.tokens.publicUser(user);
  }

  @Get('stores')
  listStores() {
    return this.db
      .select({
        id: stores.id,
        name: stores.name,
        slug: stores.slug,
        city: stores.city,
        status: stores.status,
        payoutsEnabled: stores.payoutsEnabled,
        ownerEmail: users.email,
        createdAt: stores.createdAt,
      })
      .from(stores)
      .innerJoin(users, eq(users.id, stores.ownerId))
      .orderBy(stores.name);
  }

  @Patch('stores/:id')
  async updateStore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStoreStatusDto,
    @CurrentUser() admin: AuthUser,
    @Meta() meta: RequestMeta,
  ) {
    const [store] = await this.db
      .update(stores)
      .set({ status: dto.status })
      .where(eq(stores.id, id))
      .returning();
    if (!store) throw new NotFoundException();
    await this.audit.record(
      'admin_store_updated',
      store.ownerId,
      meta,
      { storeId: id, ...dto },
      admin.sub,
    );
    return store;
  }

  @Get('audit')
  auditLog(@Query('action') action?: string) {
    return this.audit.list({ action }, 100);
  }

  @Get('stats')
  async stats() {
    const [row] = await this.db
      .select({
        users: sql<number>`count(*)::int`,
        sellers: sql<number>`count(*) FILTER (WHERE 'seller' = ANY(${users.roles}))::int`,
        twoFactor: sql<number>`count(*) FILTER (WHERE ${users.totpEnabled})::int`,
        newThisWeek: sql<number>`count(*) FILTER (WHERE ${users.createdAt} > now() - interval '7 days')::int`,
      })
      .from(users);
    return row;
  }
}
