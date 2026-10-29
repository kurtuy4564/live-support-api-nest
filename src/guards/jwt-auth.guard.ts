import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

type JwtPayload = {
  sub: string;
  email: string;
  role?: 'CLIENT' | 'OPERATOR' | 'ADMIN';
};

type AuthenticatedRequest = Request & {
  user?: JwtPayload;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;
    const token = authorization?.match(/^\s*Bearer\s+(\S+)\s*$/i)?.[1];

    if (!token) {
      throw new UnauthorizedException('Требуется токен авторизации');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Недействительный или истёкший токен');
    }

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string'
    ) {
      throw new UnauthorizedException('Недействительный токен');
    }

    if (this.prisma) {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { role: true, isBlocked: true },
      });
      if (!user) {
        throw new UnauthorizedException('Пользователь не найден');
      }
      if (user.isBlocked) {
        throw new ForbiddenException('Пользователь заблокирован');
      }
      payload.role = user.role;
    }

    request.user = payload;
    return true;
  }
}
