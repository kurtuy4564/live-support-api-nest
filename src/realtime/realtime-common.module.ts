import { Module } from '@nestjs/common';
import { PresenceService } from './presence/presence.service.js';
import { RealtimeEventsService } from './realtime-events.service.js';

@Module({
  providers: [PresenceService, RealtimeEventsService],
  exports: [PresenceService, RealtimeEventsService],
})
export class RealtimeCommonModule {}
