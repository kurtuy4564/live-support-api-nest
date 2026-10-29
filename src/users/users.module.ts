import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersService } from './users.service.js';
import { AdminUsersController, UsersController } from './users.controller.js';
import { RealtimeCommonModule } from '../realtime/realtime-common.module.js';

@Module({
  imports: [AuthModule, RealtimeCommonModule],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService],
})
export class UsersModule {}
