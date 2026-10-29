import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeEventsService } from '../realtime/realtime-events.service.js';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        lastSeenAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    return user;
  }

  async findAdminUsers(
    query: AdminUsersQueryDto,
    role: 'CLIENT' | 'OPERATOR' | 'ADMIN',
  ) {
    this.requireAdmin(role);
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isBlocked: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async setBlocked(
    targetUserId: string,
    actorId: string,
    actorRole: 'CLIENT' | 'OPERATOR' | 'ADMIN',
    blocked: boolean,
  ) {
    this.requireAdmin(actorRole);
    if (targetUserId === actorId && blocked) {
      throw new BadRequestException('Нельзя заблокировать самого себя');
    }

    const result = await this.prisma.user.updateMany({
      where: { id: targetUserId },
      data: { isBlocked: blocked },
    });
    if (result.count === 0) {
      throw new NotFoundException('Пользователь не найден');
    }

    if (blocked) {
      this.realtimeEvents.disconnectUser(targetUserId);
    }

    return { id: targetUserId, isBlocked: blocked };
  }

  private requireAdmin(role: 'CLIENT' | 'OPERATOR' | 'ADMIN') {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Требуются права администратора');
    }
  }
}
