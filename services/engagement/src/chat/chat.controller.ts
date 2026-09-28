import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { CurrentUser, type AuthUser } from '@mercadia/service-kit';
import { ChatService } from './chat.service.js';

class StartDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productId?: string;
  @ApiProperty() @IsString() @Length(1, 2000) text: string;
}

class MessageDto {
  @ApiProperty() @IsString() @Length(1, 2000) text: string;
}

@ApiTags('chat')
@ApiBearerAuth()
@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  start(@CurrentUser() user: AuthUser, @Body() dto: StartDto) {
    return this.chat.start(user, dto);
  }

  @Get()
  @ApiQuery({ name: 'as', enum: ['buyer', 'seller'], required: false })
  list(@CurrentUser() user: AuthUser, @Query('as') as?: string) {
    return this.chat.list(user, as === 'seller' ? 'seller' : 'buyer');
  }

  @Get(':id')
  history(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.chat.history(id, user);
  }

  @Post(':id/messages')
  send(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: MessageDto) {
    return this.chat.send(id, user, dto.text);
  }
}
