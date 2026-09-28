import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { and, desc, eq } from 'drizzle-orm';
import { CurrentUser, type AuthUser } from '@mercadia/service-kit';
import { DB, type Database } from '../db/database.module.js';
import { addresses } from '../db/schema.js';

class AddressDto {
  @ApiPropertyOptional({ example: 'Casa' }) @IsOptional() @IsString() @Length(1, 40) label?: string;
  @ApiProperty() @IsString() @Length(3, 120) fullName: string;
  @ApiProperty() @Matches(/^\+?[0-9 ]{7,15}$/) phone: string;
  @ApiProperty() @IsString() @Length(4, 160) line1: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 160) line2?: string;
  @ApiProperty() @IsString() @Length(2, 80) city: string;
  @ApiProperty() @IsString() @Length(2, 80) department: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 12) postalCode?: string;
  @ApiProperty({ example: 'CO' }) @IsIn(['CO']) country: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

class UpdateAddressDto extends PartialType(AddressDto) {}

const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

@ApiTags('addresses')
@ApiBearerAuth()
@Controller('addresses')
export class AddressesController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, user.sub))
      .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: AddressDto) {
    const existing = await this.list(user);
    const isDefault = dto.isDefault ?? existing.length === 0;
    return this.db.transaction(async (tx) => {
      if (isDefault)
        await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, user.sub));
      const [row] = await tx
        .insert(addresses)
        .values({ ...defined(dto), userId: user.sub, isDefault } as typeof addresses.$inferInsert)
        .returning();
      return row;
    });
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.db.transaction(async (tx) => {
      if (dto.isDefault)
        await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, user.sub));
      const [row] = await tx
        .update(addresses)
        .set(defined(dto))
        .where(and(eq(addresses.id, id), eq(addresses.userId, user.sub)))
        .returning();
      if (!row) throw new ForbiddenException();
      return row;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.db
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, user.sub)));
  }
}
