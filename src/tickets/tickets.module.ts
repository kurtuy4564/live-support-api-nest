import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { TicketsController } from './tickets.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeCommonModule } from '../realtime/realtime-common.module.js';
import { SupportController } from './support.controller.js';

@Module({
  imports: [AuthModule, RealtimeCommonModule],
  controllers: [TicketsController, SupportController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
