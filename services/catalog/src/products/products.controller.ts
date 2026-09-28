import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { CURRENCIES, type Currency } from '@mercadia/contracts';
import { CurrentUser, Internal, Public, Roles, type AuthUser } from '@mercadia/service-kit';
import { CreateProductDto, QuoteDto, UpdateProductDto } from './dto/product.dto.js';
import { ProductQueryDto } from './dto/query.dto.js';
import { PRODUCT_STATUSES, type ProductStatus } from './product.schema.js';
import { ProductsService } from './products.service.js';

class ByIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ enum: CURRENCIES, required: false })
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: Currency;
}

class ModerateDto {
  @ApiProperty({ enum: ['active', 'blocked'] })
  @IsIn(['active', 'blocked'])
  status: 'active' | 'blocked';
}

const cur = (value?: string): Currency => (value === 'USD' ? 'USD' : 'COP');

@ApiTags('catalog')
@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get('categories')
  categories() {
    return this.products.categories();
  }

  @Public()
  @Get('products')
  @ApiOperation({ summary: 'Search and filter products, with facets' })
  search(@Query() query: ProductQueryDto) {
    return this.products.search(query);
  }

  @Public()
  @Get('products/suggest')
  suggest(@Query('q') q = '') {
    return this.products.suggest(q);
  }

  @Public()
  @Post('products/by-ids')
  @HttpCode(200)
  byIds(@Body() dto: ByIdsDto) {
    return this.products.byIds(dto.ids, cur(dto.currency));
  }

  @Public()
  @Get('products/:slug')
  @ApiQuery({ name: 'currency', enum: CURRENCIES, required: false })
  bySlug(@Param('slug') slug: string, @Query('currency') currency?: string) {
    return this.products.bySlug(slug, cur(currency));
  }

  @Public()
  @Get('products/:slug/related')
  related(@Param('slug') slug: string, @Query('currency') currency?: string) {
    return this.products.related(slug, cur(currency));
  }

  // ----- seller center -----

  @ApiBearerAuth()
  @Roles('seller')
  @Get('seller/products')
  @ApiQuery({ name: 'status', enum: PRODUCT_STATUSES, required: false })
  sellerList(@CurrentUser() user: AuthUser, @Query('status') status?: ProductStatus) {
    return this.products.sellerList(user, status);
  }

  @ApiBearerAuth()
  @Roles('seller')
  @Get('seller/products/:id')
  sellerGet(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.products.sellerGet(id, user);
  }

  @ApiBearerAuth()
  @Roles('seller')
  @Post('seller/products')
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.products.create(dto, user);
  }

  @ApiBearerAuth()
  @Roles('seller', 'admin')
  @Patch('seller/products/:id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: AuthUser) {
    return this.products.update(id, dto, user);
  }

  // ----- admin -----

  @ApiBearerAuth()
  @Roles('admin')
  @Get('admin/products')
  adminList(@Query('status') status?: ProductStatus, @Query('q') q?: string) {
    return this.products.adminList(status, q);
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Patch('admin/products/:id')
  moderate(@Param('id') id: string, @Body() dto: ModerateDto) {
    return this.products.moderate(id, dto.status);
  }

  @ApiBearerAuth()
  @Roles('admin')
  @Get('admin/catalog-stats')
  stats() {
    return this.products.stats();
  }

  // ----- service to service -----

  @Internal()
  @Get('internal/products/export')
  @ApiOperation({ summary: 'Searchable product text for the AI service (ids: comma-separated)' })
  export(@Query('ids') ids?: string) {
    return this.products.export(ids ? ids.split(',').filter(Boolean) : undefined);
  }

  @Internal()
  @Post('internal/quote')
  @HttpCode(200)
  @ApiOperation({ summary: 'Authoritative prices and stock for checkout (orders service)' })
  quote(@Body() dto: QuoteDto) {
    return this.products.quote(dto.items);
  }
}
