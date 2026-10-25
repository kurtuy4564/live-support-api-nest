import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

type JwtPayload = {
  sub: number;
  email: string;
};

type AuthenticatedRequest = Request & {
  user?: JwtPayload;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;
    const token = authorization?.match(/^\s*Bearer\s+(\S+)\s*$/i)?.[1];

    if (!token) {
      throw new UnauthorizedException('Требуется токен авторизации');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (
        typeof payload.sub !== 'number' ||
        !Number.isInteger(payload.sub) ||
        typeof payload.email !== 'string'
      ) {
        throw new UnauthorizedException('Недействительный токен');
      }

      request.user = payload;

      return true;
    } catch {
      throw new UnauthorizedException('Недействительный или истёкший токен');
    }
  }
}
