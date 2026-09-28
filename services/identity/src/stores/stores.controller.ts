import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, IsUrl, Length } from 'class-validator';
import { CurrentUser, Public, Roles, type AuthUser } from '@mercadia/service-kit';
import type { RequestMeta } from '../audit/audit.service.js';
import { Meta } from '../request-meta.js';
import { StoresService } from './stores.service.js';

class OpenStoreDto {
  @ApiProperty({ example: 'Café de la Sierra' })
  @IsString()
  @Length(3, 60)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 600)
  description?: string;

  @ApiPropertyOptional({ example: 'Santa Marta' })
  @IsOptional()
  @IsString()
  @Length(0, 80)
  city?: string;

  @ApiPropertyOptional({ example: '#6366f1' })
  @IsOptional()
  @IsHexColor()
  accentColor?: string;
}

class UpdateStoreDto extends OpenStoreDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 60)
  declare name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  logoUrl?: string;
}

@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Public()
  @Get()
  list(@Query('search') search?: string) {
    return this.stores.list(search);
  }

  @ApiBearerAuth()
  @Post()
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenStoreDto, @Meta() meta: RequestMeta) {
    return this.stores.open(user.sub, dto, meta);
  }

  @ApiBearerAuth()
  @Roles('seller')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.stores.mine(user.sub);
  }

  @ApiBearerAuth()
  @Roles('seller')
  @Patch('mine')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateStoreDto) {
    return this.stores.update(user.sub, dto);
  }

  @Public()
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.stores.bySlug(slug);
  }
}
