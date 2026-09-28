import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiBearerAuth, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import type { Model } from 'mongoose';
import { CurrentUser, type AuthUser } from '@mercadia/service-kit';
import { ServiceClients } from '../clients/clients.js';
import { WishlistItem } from '../schemas.js';

class AddDto {
  @ApiProperty() @IsString() productId: string;
}

@ApiTags('wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(
    @InjectModel(WishlistItem.name) private readonly items: Model<WishlistItem>,
    private readonly clients: ServiceClients,
  ) {}

  /** Saved products with their current price, and how much it dropped since they were saved. */
  @Get()
  @ApiQuery({ name: 'currency', enum: ['COP', 'USD'], required: false })
  async list(@CurrentUser() user: AuthUser, @Query('currency') currency?: string) {
    const saved = await this.items.find({ userId: user.sub }).sort({ createdAt: -1 }).lean();
    const ids = saved.map((s) => s.productId);
    const cur = currency === 'USD' ? 'USD' : 'COP';
    const [local, usd] = await Promise.all([
      this.clients.products(ids, cur),
      cur === 'USD' ? Promise.resolve(null) : this.clients.products(ids, 'USD'),
    ]);
    const byId = new Map(local.map((p) => [p.id, p]));
    const usdById = new Map((usd ?? local).map((p) => [p.id, p.price]));
    return saved.map((s) => {
      const nowUsd = usdById.get(s.productId);
      return {
        productId: s.productId,
        savedAt: s.createdAt,
        priceUsdAtAdd: s.priceUsdAtAdd,
        product: byId.get(s.productId) ?? null,
        dropPercent:
          nowUsd !== undefined && nowUsd < s.priceUsdAtAdd
            ? Math.round((1 - nowUsd / s.priceUsdAtAdd) * 100)
            : 0,
      };
    });
  }

  @Get('ids')
  async ids(@CurrentUser() user: AuthUser) {
    return (await this.items.find({ userId: user.sub }).select({ productId: 1 }).lean()).map(
      (s) => s.productId,
    );
  }

  /** The price is read from the catalog, not trusted from the client. */
  @Post()
  @HttpCode(204)
  async add(@CurrentUser() user: AuthUser, @Body() dto: AddDto) {
    const [product] = await this.clients.products([dto.productId]);
    if (!product) throw new NotFoundException('Product not found');
    await this.items.updateOne(
      { userId: user.sub, productId: dto.productId },
      { $setOnInsert: { priceUsdAtAdd: product.price } },
      { upsert: true },
    );
  }

  @Delete(':productId')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    await this.items.deleteOne({ userId: user.sub, productId });
  }
}
