import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MessagesService } from './messages.service.js';

@Module({
  imports: [PrismaModule],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
