import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { CurrentUser, Roles, type AuthUser } from '@mercadia/service-kit';
import { DISPUTE_REASONS } from '../db/schema.js';
import { DisputesService } from './disputes.service.js';

class OpenDisputeDto {
  @ApiProperty() @IsUUID() sellerOrderId: string;
  @ApiProperty({ enum: DISPUTE_REASONS }) @IsIn(DISPUTE_REASONS) reason: string;
  @ApiProperty() @IsString() @Length(10, 2000) description: string;
  @ApiPropertyOptional({ description: 'Minor units; defaults to the whole seller order' })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;
}

class MessageDto {
  @ApiProperty() @IsString() @Length(1, 2000) text: string;
}

class RespondDto {
  @ApiProperty({ enum: ['accept', 'reject'] }) @IsIn(['accept', 'reject']) action:
    'accept' | 'reject';
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 2000) text?: string;
}

class ResolveDto {
  @ApiProperty({ enum: ['refund', 'partial_refund', 'rejected'] })
  @IsIn(['refund', 'partial_refund', 'rejected'])
  resolution: 'refund' | 'partial_refund' | 'rejected';
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 2000) text?: string;
}

@ApiTags('disputes')
@ApiBearerAuth()
@Controller()
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post('disputes')
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenDisputeDto) {
    return this.disputes.open(user, dto);
  }

  @Get('disputes')
  @ApiQuery({ name: 'as', enum: ['buyer', 'seller'], required: false })
  list(@CurrentUser() user: AuthUser, @Query('as') as?: string) {
    return this.disputes.list(user, as === 'seller' ? 'seller' : 'buyer');
  }

  @Get('disputes/:id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.disputes.detail(id, user);
  }

  @Post('disputes/:id/messages')
  @HttpCode(200)
  message(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: MessageDto,
  ) {
    return this.disputes.message(id, user, dto.text);
  }

  @Roles('seller')
  @Post('disputes/:id/respond')
  @HttpCode(200)
  respond(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RespondDto,
  ) {
    return this.disputes.sellerRespond(id, user, dto.action, dto.text ?? '');
  }

  @Post('disputes/:id/escalate')
  @HttpCode(200)
  escalate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.disputes.escalate(id, user);
  }

  @Roles('admin')
  @Get('admin/disputes')
  adminList() {
    return this.disputes.adminList();
  }

  @Roles('admin')
  @Post('admin/disputes/:id/resolve')
  @HttpCode(200)
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ResolveDto,
  ) {
    return this.disputes.adminResolve(id, user, dto.resolution, dto.amount ?? 0, dto.text ?? '');
  }
}
