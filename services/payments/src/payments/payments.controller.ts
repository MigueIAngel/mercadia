import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { CurrentUser, Roles, type AuthUser } from '@mercadia/service-kit';
import { PaymentsService } from './payments.service.js';

class StartPaymentDto {
  @ApiProperty() @IsString() @Length(36, 36) orderId: string;
}

class MockCardDto {
  @ApiProperty({ example: '4242 4242 4242 4242' }) @Matches(/^[0-9 ]{13,23}$/) number: string;
  @ApiProperty({ example: 12 }) @IsInt() @Min(1) @Max(12) expMonth: number;
  @ApiProperty({ example: 2030 }) @IsInt() @Min(20) @Max(2100) expYear: number;
  @ApiProperty({ example: '123' }) @Matches(/^\d{3,4}$/) cvc: string;
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('payments/intents')
  @ApiOperation({
    summary: 'Creates or resumes the payment of an order (Stripe client secret or simulated)',
  })
  start(@Body() dto: StartPaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.startPayment(dto.orderId, user);
  }

  @Get('payments/orders/:orderId')
  status(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUser() user: AuthUser) {
    return this.payments.status(orderId, user);
  }

  @Post('payments/:id/confirm-test')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Simulated processor only. Test cards: 4242… succeeds, 4000 0000 0000 0002 declined, 4000 0000 0000 9995 insufficient funds',
  })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() card: MockCardDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.confirmMock(id, user, card);
  }

  @Roles('seller')
  @Get('seller/payouts')
  payouts(@CurrentUser() user: AuthUser) {
    return this.payments.payouts(user.storeId!);
  }

  @Roles('seller')
  @Post('seller/payouts/onboarding')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Stripe Connect Express onboarding link (enabled directly in simulated mode)',
  })
  onboard(@CurrentUser() user: AuthUser) {
    return this.payments.onboard(user);
  }

  @Roles('admin')
  @Get('admin/payments')
  admin() {
    return this.payments.adminList();
  }
}
