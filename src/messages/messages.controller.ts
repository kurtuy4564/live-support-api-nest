import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { GetMessagesQueryDto } from './dto/get-messages-query.dto.js';
import { MessagesService } from './messages.service.js';

type AuthenticatedUser = {
  sub: string;
  role?: 'CLIENT' | 'OPERATOR' | 'ADMIN';
};

@Controller('tickets/:ticketId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ticketId') ticketId: string,
    @Query() query: GetMessagesQueryDto,
  ) {
    return this.messagesService.getMessages(
      ticketId,
      user.sub,
      user.role ?? 'CLIENT',
      query.cursor,
      query.limit,
    );
  }
}
