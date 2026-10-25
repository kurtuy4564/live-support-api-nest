import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    // bcrypt ограничивает пароль 72 байтами
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException('Пароль должен занимать не более 72 байт');
    }

    // 1. Проверяем, существует ли пользователь
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    // 2. Хешируем пароль
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // 3. Создаем пользователя и сессию атомарно
    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: {
            email,
            passwordHash,
            name: dto.name,
            role: 'CLIENT',
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        });

        await transaction.session.create({
          data: {
            userId: createdUser.id,
            refreshTokenHash,
            expiresAt: refreshExpiresAt,
          },
        });

        return createdUser;
      });

      const accessToken = await this.jwtService.signAsync({
        sub: user.id,
        email: user.email,
      });

      return { accessToken, refreshToken, user };
    } catch (error) {
      // Защита от двух одновременных регистраций
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Пользователь с таким email уже существует',
        );
      }

      throw error;
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    // 1. Ищем пользователя
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });

    // 2. Проверяем, существует ли пользователь
    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    // 3. Сравниваем пароль с хешем
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    // 4. Создаём JWT
    const access_token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    // 5. Возвращаем токен
    return { access_token };
  }

  async refresh() {
    //TODO
  }

  async logout() {
    //TODO
  }
}
