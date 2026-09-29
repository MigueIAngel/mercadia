import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Internal, Roles, type AuthUser } from '@mercadia/service-kit';
import {
  ORDER_STATUSES,
  SELLER_ORDER_STATUSES,
  type OrderStatus,
  type SellerOrderStatus,
} from '../db/schema.js';
import { OrdersService } from './orders.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('orders')
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.mine(user.sub);
  }

  @Get('orders/:id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.detail(id, user);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.cancelByBuyer(id, user);
  }

  // ----- seller -----

  @Roles('seller')
  @Get('seller/orders')
  @ApiQuery({ name: 'status', enum: SELLER_ORDER_STATUSES, required: false })
  sellerOrders(@CurrentUser() user: AuthUser, @Query('status') status?: SellerOrderStatus) {
    return this.orders.sellerList(user.storeId!, status);
  }

  @Roles('seller')
  @Post('seller/orders/:id/accept')
  @HttpCode(200)
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.orders.sellerAccept(id, user);
  }

  @Roles('seller')
  @Get('seller/sales')
  sales(@CurrentUser() user: AuthUser) {
    return this.orders.sellerSales(user.storeId!);
  }

  // ----- admin -----

  @Roles('admin')
  @Get('admin/orders')
  @ApiQuery({ name: 'status', enum: ORDER_STATUSES, required: false })
  adminList(@Query('status') status?: OrderStatus) {
    return this.orders.adminList(status);
  }

  @Roles('admin')
  @Get('admin/orders/stats')
  adminStats() {
    return this.orders.adminStats();
  }

  // ----- service to service -----

  @Internal()
  @Get('internal/orders/:id')
  forPayment(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.forPayment(id);
  }

  @Internal()
  @Get('internal/purchases')
  async purchased(@Query('buyerId') buyerId: string, @Query('productId') productId: string) {
    return { purchased: await this.orders.hasPurchased(buyerId, productId) };
  }
}
