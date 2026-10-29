import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto.js';
import { BlockUserDto } from './dto/block-user.dto.js';

type AuthenticatedUser = {
  sub: string;
  email: string;
  role: 'CLIENT' | 'OPERATOR' | 'ADMIN';
};

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findMe(user.sub);
  }
}

@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  adminUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AdminUsersQueryDto,
  ) {
    return this.usersService.findAdminUsers(query, user.role);
  }

  @Patch(':id/block')
  @UseGuards(JwtAuthGuard)
  blockUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') targetUserId: string,
    @Body() dto: BlockUserDto,
  ) {
    return this.usersService.setBlocked(
      targetUserId,
      user.sub,
      user.role,
      dto.blocked,
    );
  }
}
