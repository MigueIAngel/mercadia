import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Max, Min } from 'class-validator';
import type { Currency } from '@mercadia/contracts';
import { CurrentUser, Public, type AuthUser } from '@mercadia/service-kit';
import { CartService } from './cart.service.js';

class AddItemDto {
  @ApiProperty() @IsString() productId: string;
  @ApiProperty() @IsString() sku: string;
  @ApiProperty({ minimum: 1, maximum: 20 }) @IsInt() @Min(1) @Max(20) quantity: number;
}

class QuantityDto {
  @ApiProperty({ minimum: 0, maximum: 20 }) @IsInt() @Min(0) @Max(20) quantity: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Works for guests (x-cart-id) and signed-in users; guest items merge at sign-in. */
@ApiTags('cart')
@ApiHeader({ name: 'x-cart-id', required: false, description: 'Anonymous cart id (guests)' })
@Public()
@Controller('cart')
export class CartController {
  constructor(private readonly carts: CartService) {}

  private owner(user: AuthUser | undefined, cartId: string | undefined) {
    const guestCartId = cartId && UUID.test(cartId) ? cartId : undefined;
    if (!user && !guestCartId) throw new BadRequestException('Missing x-cart-id');
    return this.carts.resolve({ userId: user?.sub, guestCartId });
  }

  @Get()
  async get(
    @CurrentUser() user: AuthUser | undefined,
    @Headers('x-cart-id') cartId: string,
    @Query('currency') currency?: string,
  ) {
    return this.carts.view(
      await this.owner(user, cartId),
      (currency === 'USD' ? 'USD' : 'COP') as Currency,
    );
  }

  @Get('count')
  async count(@CurrentUser() user: AuthUser | undefined, @Headers('x-cart-id') cartId: string) {
    return { count: await this.carts.count(await this.owner(user, cartId)) };
  }

  @Post('items')
  @HttpCode(204)
  async add(
    @CurrentUser() user: AuthUser | undefined,
    @Headers('x-cart-id') cartId: string,
    @Body() dto: AddItemDto,
  ) {
    await this.carts.add(await this.owner(user, cartId), dto.productId, dto.sku, dto.quantity);
  }

  @Patch('items/:sku')
  @HttpCode(204)
  async update(
    @CurrentUser() user: AuthUser | undefined,
    @Headers('x-cart-id') cartId: string,
    @Param('sku') sku: string,
    @Body() dto: QuantityDto,
  ) {
    await this.carts.setQuantity(await this.owner(user, cartId), sku, dto.quantity);
  }

  @Delete('items/:sku')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser | undefined,
    @Headers('x-cart-id') cartId: string,
    @Param('sku') sku: string,
  ) {
    await this.carts.remove(await this.owner(user, cartId), sku);
  }
}
