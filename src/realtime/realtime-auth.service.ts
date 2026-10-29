import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../prisma/prisma.service.js';
import type { SocketUser } from './interfaces/authenticated-socket.interface.js';

@Injectable()
export class RealtimeAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticate(token: unknown): Promise<SocketUser> {
    if (typeof token !== 'string' || !token.trim()) {
      throw new UnauthorizedException('Токен отсутствует');
    }

    // Проверяем подпись и срок действия access token
    let payload: { sub?: unknown };

    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Недействительный токен');
    }

    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException('Некорректный токен');
    }

    // Получаем актуальные данные пользователя
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isBlocked: true,
      },
    });

    if (!user || user.isBlocked) {
      throw new UnauthorizedException('Доступ запрещён');
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
