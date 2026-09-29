import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { STORES } from '@mercadia/demo-data';
import { Internal, Public } from '@mercadia/service-kit';
import { quoteParcel, zoneFor } from './rates.js';

class DestinationDto {
  @ApiProperty() @IsString() city: string;
  @ApiProperty() @IsString() department: string;
}

class ParcelDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsInt() @Min(0) weightGrams: number;
  @ApiProperty() @IsInt() @Min(0) subtotalUsd: number;
}

class RatesDto {
  @ApiProperty({ type: DestinationDto })
  @ValidateNested()
  @Type(() => DestinationDto)
  destination: DestinationDto;
  @ApiProperty({ type: [ParcelDto] })
  @ValidateNested({ each: true })
  @Type(() => ParcelDto)
  @ArrayMaxSize(20)
  parcels: ParcelDto[];
}

const originOf = (storeId: string) => ({
  city: STORES.find((s) => s.id === storeId)?.city ?? 'Bogotá',
});

@ApiTags('shipping')
@Controller()
export class RatesController {
  /** Used by orders at checkout. */
  @Internal()
  @Post('internal/rates')
  @HttpCode(200)
  internalRates(@Body() dto: RatesDto) {
    return dto.parcels.map((p) => ({
      storeId: p.storeId,
      ...quoteParcel(zoneFor(originOf(p.storeId), dto.destination), p.weightGrams, p.subtotalUsd),
    }));
  }

  /** Public estimate for product pages. */
  @Public()
  @Post('shipping/estimate')
  @HttpCode(200)
  estimate(@Body() dto: RatesDto) {
    return this.internalRates(dto);
  }
}
