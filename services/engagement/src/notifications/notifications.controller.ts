import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { CurrentUser, type AuthUser } from '@mercadia/service-kit';
import { NotificationsService } from './notifications.service.js';

class ReadDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.sub);
  }

  @Get('unread')
  unread(@CurrentUser() user: AuthUser) {
    return this.notifications.unread(user.sub);
  }

  @Post('read')
  @HttpCode(204)
  async read(@CurrentUser() user: AuthUser, @Body() dto: ReadDto) {
    await this.notifications.markRead(user.sub, dto.ids);
  }
}
