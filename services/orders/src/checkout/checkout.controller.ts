import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '@mercadia/service-kit';
import { CheckoutDto } from './checkout.dto.js';
import { CheckoutService } from './checkout.service.js';

@ApiTags('checkout')
@ApiBearerAuth()
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('quote')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cart totals with shipping per store for an address' })
  quote(
    @CurrentUser() user: AuthUser,
    @Body() dto: CheckoutDto,
    @Headers('x-cart-id') cartId?: string,
  ) {
    return this.checkout.quote(user, dto.currency, dto.address, cartId);
  }

  @Post()
  @ApiOperation({ summary: 'Places the order (pending payment); stock is reserved asynchronously' })
  place(
    @CurrentUser() user: AuthUser,
    @Body() dto: CheckoutDto,
    @Headers('x-cart-id') cartId?: string,
  ) {
    return this.checkout.place(user, dto.currency, dto.address, cartId);
  }
}
