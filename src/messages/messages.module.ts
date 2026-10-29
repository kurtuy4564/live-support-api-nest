import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service.js';

@Module({
  providers: [MessagesService]
})
export class MessagesModule {}
