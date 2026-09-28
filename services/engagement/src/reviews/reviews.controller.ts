import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CurrentUser, Public, Roles, type AuthUser } from '@mercadia/service-kit';
import { ReviewsService } from './reviews.service.js';

class CreateReviewDto {
  @ApiProperty() @IsString() productId: string;
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) rating: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 120) title?: string;
  @ApiProperty() @IsString() @Length(10, 3000) comment: string;
}

class ReplyDto {
  @ApiProperty() @IsString() @Length(2, 2000) text: string;
}

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('reviews/products/:productId')
  @ApiQuery({ name: 'sort', enum: ['recent', 'helpful', 'rating'], required: false })
  forProduct(
    @Param('productId') productId: string,
    @Query('sort') sort?: 'recent' | 'helpful' | 'rating',
    @Query('page') page?: string,
  ) {
    return this.reviews.forProduct(productId, sort, Math.max(1, Number(page) || 1));
  }

  @Public()
  @Get('reputation/stores/:storeId')
  reputation(@Param('storeId') storeId: string) {
    return this.reviews.storeReputation(storeId);
  }

  @ApiBearerAuth()
  @Post('reviews')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user, dto);
  }

  @ApiBearerAuth()
  @Post('reviews/:id/helpful')
  @HttpCode(200)
  helpful(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reviews.helpful(id, user);
  }

  @ApiBearerAuth()
  @Roles('seller')
  @Post('reviews/:id/reply')
  @HttpCode(200)
  reply(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: ReplyDto) {
    return this.reviews.reply(id, user, dto.text);
  }

  @ApiBearerAuth()
  @Roles('seller')
  @Get('seller/reviews')
  forStore(@CurrentUser() user: AuthUser) {
    return this.reviews.forStore(user.storeId!);
  }
}
