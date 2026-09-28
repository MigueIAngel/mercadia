import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CURRENCIES, type Currency } from '@mercadia/contracts';
import { CATEGORIES } from '@mercadia/demo-data';

export class PriceDto {
  @ApiProperty({ example: 199900, description: 'Minor units (cents), tax included' })
  @IsInt()
  @Min(100)
  amount: number;

  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES)
  currency: Currency;
}

export class OptionDto {
  @ApiProperty({ example: 'size' })
  @IsString()
  @Length(1, 30)
  name: string;

  @ApiProperty({ example: ['S', 'M', 'L'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  values: string[];
}

export class VariantDto {
  @ApiPropertyOptional({ description: 'Generated when omitted' })
  @IsOptional()
  @IsString()
  @Length(2, 60)
  sku?: string;

  @ApiProperty({ example: { size: 'M' } })
  @IsObject()
  options: Record<string, string>;

  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(0)
  @Max(100000)
  stock: number;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Café de origen Sierra Nevada 500 g' })
  @IsString()
  @Length(3, 140)
  title: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  brand?: string;

  @ApiProperty({ enum: CATEGORIES.map((c) => c.slug) })
  @IsIn(CATEGORIES.map((c) => c.slug))
  category: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subcategory?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsUrl({}, { each: true })
  images: string[];

  @ApiProperty({ type: PriceDto })
  @ValidateNested()
  @Type(() => PriceDto)
  price: PriceDto;

  @ApiPropertyOptional({ type: PriceDto, description: 'Previous price to show a discount' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PriceDto)
  compareAt?: PriceDto;

  @ApiPropertyOptional({ type: [OptionDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options?: OptionDto[];

  @ApiProperty({ type: [VariantDto] })
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  variants: VariantDto[];

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  weightGrams?: number;

  @ApiPropertyOptional({ enum: ['draft', 'active'] })
  @IsOptional()
  @IsIn(['draft', 'active'])
  status?: 'draft' | 'active';
}

export class UpdateProductDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 140) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(CATEGORIES.map((c) => c.slug)) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subcategory?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUrl({}, { each: true })
  images?: string[];

  @ApiPropertyOptional({ type: PriceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PriceDto)
  price?: PriceDto;

  @ApiPropertyOptional({ type: PriceDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => PriceDto)
  compareAt?: PriceDto | null;

  @ApiPropertyOptional({ type: [OptionDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options?: OptionDto[];

  @ApiPropertyOptional({ type: [VariantDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  @ArrayMinSize(1)
  variants?: VariantDto[];

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) weightGrams?: number;

  @ApiPropertyOptional({ enum: ['draft', 'active', 'archived'] })
  @IsOptional()
  @IsIn(['draft', 'active', 'archived'])
  status?: 'draft' | 'active' | 'archived';
}

export class QuoteItemDto {
  @ApiProperty() @IsString() productId: string;
  @ApiProperty() @IsString() sku: string;
  @ApiProperty() @IsInt() @Min(1) @Max(100) quantity: number;
}

export class QuoteDto {
  @ApiProperty({ type: [QuoteItemDto] })
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  items: QuoteItemDto[];
}
