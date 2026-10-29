import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MessagesService } from './messages.service.js';
import { MessagesController } from './messages.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';

@Module({
  imports: [PrismaModule, AuthModule, TicketsModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
