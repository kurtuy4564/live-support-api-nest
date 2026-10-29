import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { СreateTicketDto } from './dto/tickets.dto.js';
import { GetTicketsQueryDto } from './dto/get-tickets-query.dto.js';
import { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTickets(dto: СreateTicketDto, userId: string) {
    return this.prisma.ticket.create({
      data: {
        ...dto,
        clientId: userId,
      },
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async getAllTickets(query: GetTicketsQueryDto, userId: string) {
    const { status, assignedTo, page, limit } = query;

    const where: Prisma.TicketWhereInput = {
      ...(status && { status }),
      ...(assignedTo === 'me' && { operatorId: userId }),
    };

    const [tickets, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),

      this.prisma.ticket.count({ where }),
    ]);
    return {
      data: tickets,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async checkTicketAccess(
    ticketId: string,
    userId: string,
    role: 'CLIENT' | 'OPERATOR' | 'ADMIN',
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        clientId: true,
        operatorId: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Тикет не найден');
    }

    if (role === 'ADMIN') {
      return;
    }

    if (role === 'CLIENT' && ticket.clientId === userId) {
      return;
    }

    if (role === 'OPERATOR' && ticket.operatorId === userId) {
      return;
    }

    throw new ForbiddenException('Нет доступа к тикету');
  }

  async takeTicket(
    ticketId: string,
    userId: string,
    role: 'CLIENT' | 'OPERATOR' | 'ADMIN',
  ) {
    // 1. Проверяем роль пользователя
    if (role !== 'OPERATOR' && role !== 'ADMIN') {
      throw new ForbiddenException('Только оператор может взять тикет');
    }

    // 2. Пытаемся атомарно назначить тикет
    const result = await this.prisma.ticket.updateMany({
      where: {
        id: ticketId,
        status: 'NEW',
        operatorId: null,
      },
      data: {
        status: 'ASSIGNED',
        operatorId: userId,
        takenAt: new Date(),
      },
    });

    // 3. Если ничего не обновилось
    if (result.count === 0) {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true },
      });

      if (!ticket) {
        throw new NotFoundException('Тикет не найден');
      }

      throw new ConflictException('ALREADY_TAKEN');
    }

    // 4. Получаем обновлённый тикет
    return this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        clientId: true,
        operatorId: true,
        takenAt: true,
      },
    });
  }

  async closeTicket(
    ticketId: string,
    userId: string,
    role: 'CLIENT' | 'OPERATOR' | 'ADMIN',
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        clientId: true,
        operatorId: true,
        status: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Тикет не найден');
    }

    const isClient = role === 'CLIENT' && ticket.clientId === userId;

    const isOperator = role === 'OPERATOR' && ticket.operatorId === userId;

    const isAdmin = role === 'ADMIN';

    if (!isClient && !isOperator && !isAdmin) {
      throw new ForbiddenException('Нет доступа к тикету');
    }

    if (ticket.status === 'CLOSED') {
      throw new ConflictException('Тикет уже закрыт');
    }

    const result = await this.prisma.ticket.updateMany({
      where: {
        id: ticketId,
        status: { not: 'CLOSED' },
        ...(role === 'CLIENT'
          ? { clientId: userId }
          : role === 'OPERATOR'
            ? { operatorId: userId }
            : {}),
      },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: userId,
      },
    });

    if (result.count === 0) {
      throw new ConflictException('Тикет уже закрыт или доступ изменился');
    }

    return this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: {
        id: true,
        clientId: true,
        operatorId: true,
        status: true,
        closedAt: true,
        closedById: true,
      },
    });
  }
}
