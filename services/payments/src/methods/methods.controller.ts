import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { CurrentUser, type AuthUser } from '@mercadia/service-kit';
import { MethodsService } from './methods.service.js';

class TestCardDto {
  @ApiProperty({ example: '4242 4242 4242 4242' }) @Matches(/^[0-9 ]{13,23}$/) number: string;
  @ApiProperty({ example: 12 }) @IsInt() @Min(1) @Max(12) expMonth: number;
  @ApiProperty({ example: 2030 }) @IsInt() @Min(20) @Max(2100) expYear: number;
  @ApiProperty({ example: '123' }) @Matches(/^\d{3,4}$/) cvc: string;
}

class CompleteSetupDto {
  @ApiProperty({ example: 'seti_123' }) @IsString() @Matches(/^seti_\w+$/) setupIntentId: string;
}

class PayWithSavedDto {
  @ApiProperty() @IsString() @Length(36, 36) methodId: string;
}

@ApiTags('payment methods')
@ApiBearerAuth()
@Controller('payments')
export class MethodsController {
  constructor(private readonly methods: MethodsService) {}

  @Get('methods')
  @ApiOperation({ summary: 'Saved cards of the current user (default first)' })
  list(@CurrentUser() user: AuthUser) {
    return this.methods.list(user.sub);
  }

  @Post('methods/setup')
  @HttpCode(200)
  @ApiOperation({ summary: 'Starts saving a card: Stripe SetupIntent client secret, or simulated' })
  setup(@CurrentUser() user: AuthUser) {
    return this.methods.setup(user);
  }

  @Post('methods/complete')
  @ApiOperation({ summary: 'Stores the card of a confirmed Stripe SetupIntent' })
  complete(@CurrentUser() user: AuthUser, @Body() dto: CompleteSetupDto) {
    return this.methods.completeSetup(user, dto.setupIntentId);
  }

  @Post('methods/test-card')
  @ApiOperation({
    summary: 'Simulated processor only: saves a test card (4000 0000 0000 0002 is declined)',
  })
  saveTestCard(@CurrentUser() user: AuthUser, @Body() card: TestCardDto) {
    return this.methods.saveTestCard(user, card);
  }

  @Post('methods/:id/default')
  @HttpCode(200)
  makeDefault(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.methods.makeDefault(user.sub, id);
  }

  @Delete('methods/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.methods.remove(user.sub, id);
  }

  @Post(':id/pay-saved')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pays an order with a saved card (may return a 3-D Secure step)' })
  paySaved(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayWithSavedDto,
  ) {
    return this.methods.payWithSaved(id, user, dto.methodId);
  }
}
