import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches, ValidateNested } from 'class-validator';
import { CURRENCIES, type Currency } from '@mercadia/contracts';

export class AddressDto {
  @ApiProperty({ example: 'Laura Gómez' }) @IsString() @Length(3, 120) fullName: string;
  @ApiProperty({ example: '3001234567' }) @Matches(/^\+?[0-9 ]{7,15}$/) phone: string;
  @ApiProperty({ example: 'Calle 72 # 10-34' }) @IsString() @Length(4, 160) line1: string;
  @ApiPropertyOptional({ example: 'Apto 502' })
  @IsOptional()
  @IsString()
  @Length(0, 160)
  line2?: string;
  @ApiProperty({ example: 'Bogotá' }) @IsString() @Length(2, 80) city: string;
  @ApiProperty({ example: 'Cundinamarca' }) @IsString() @Length(2, 80) department: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 12) postalCode?: string;
  @ApiProperty({ example: 'CO' }) @IsIn(['CO']) country: string;
}

export class CheckoutDto {
  @ApiProperty({ enum: CURRENCIES }) @IsIn(CURRENCIES) currency: Currency;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;
}
