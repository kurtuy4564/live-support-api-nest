import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { AuthModule } from '../auth/auth.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { RealtimeAuthService } from './realtime-auth.service.js';
import { MessagesModule } from '../messages/messages.module.js';
import { PresenceService } from './presence/presence.service.js';

@Module({
  imports: [AuthModule, TicketsModule, MessagesModule],
  providers: [RealtimeGateway, RealtimeAuthService, PresenceService],
})
export class RealtimeModule {}
