import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { AuthModule } from '../auth/auth.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { RealtimeAuthService } from './realtime-auth.service.js';

@Module({
  imports: [AuthModule, TicketsModule],
  providers: [RealtimeGateway, RealtimeAuthService],
})
export class RealtimeModule {}
