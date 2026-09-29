import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, Public, Roles, type AuthUser } from '@mercadia/service-kit';
import { ShipmentsService } from './shipments.service.js';

class CreateShipmentDto {
  @ApiProperty() @IsUUID() sellerOrderId: string;
  @ApiPropertyOptional({ enum: ['standard', 'express'] })
  @IsOptional()
  @IsIn(['standard', 'express'])
  service?: 'standard' | 'express';
}

@ApiTags('shipments')
@Controller()
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  /** Public tracking page (no personal data). */
  @Public()
  @Get('shipments/track/:trackingNumber')
  track(@Param('trackingNumber') trackingNumber: string) {
    return this.shipments.track(trackingNumber);
  }

  @ApiBearerAuth()
  @Get('shipments/orders/:orderId')
  forOrder(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUser() user: AuthUser) {
    return this.shipments.forOrder(orderId, user);
  }

  @ApiBearerAuth()
  @Roles('seller')
  @Get('seller/shipments')
  sellerList(@CurrentUser() user: AuthUser) {
    return this.shipments.sellerList(user.storeId!);
  }

  @ApiBearerAuth()
  @Roles('seller')
  @Post('seller/shipments')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateShipmentDto) {
    return this.shipments.create(user, dto.sellerOrderId, dto.service);
  }
}
