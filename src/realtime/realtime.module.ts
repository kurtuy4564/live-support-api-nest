import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { AuthModule } from '../auth/auth.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { RealtimeAuthService } from './realtime-auth.service.js';
import { MessagesModule } from '../messages/messages.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeCommonModule } from './realtime-common.module.js';

@Module({
  imports: [
    AuthModule,
    TicketsModule,
    PrismaModule,
    MessagesModule,
    RealtimeCommonModule,
  ],
  providers: [RealtimeGateway, RealtimeAuthService],
})
export class RealtimeModule {}
