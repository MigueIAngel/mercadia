import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CURRENCIES, type Currency } from '@mercadia/contracts';

export const SORTS = [
  'relevance',
  'newest',
  'price_asc',
  'price_desc',
  'rating',
  'bestselling',
] as const;
export type Sort = (typeof SORTS)[number];

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class ProductQueryDto {
  @ApiPropertyOptional({ description: 'Full-text search (typo tolerant with Atlas Search)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 'electronics' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'smartphones' })
  @IsOptional()
  @IsString()
  subcategory?: string;

  @ApiPropertyOptional({ description: 'Store slug' })
  @IsOptional()
  @IsString()
  store?: string;

  @ApiPropertyOptional({ description: 'Comma-separated brands' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'In the requested currency, major units' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  onSale?: boolean;

  @ApiPropertyOptional({ enum: SORTS, default: 'relevance' })
  @IsOptional()
  @IsIn(SORTS)
  sort?: Sort;

  @ApiPropertyOptional({ enum: CURRENCIES, default: 'COP' })
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: Currency;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 24, maximum: 48 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number;
}
