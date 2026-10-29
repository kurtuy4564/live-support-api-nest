import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { СreateTicketDto } from './dto/tickets.dto.js';
import { GetTicketsQueryDto } from './dto/get-tickets-query.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { RealtimeEventsService } from '../realtime/realtime-events.service.js';
import { PresenceService } from '../realtime/presence/presence.service.js';
import { RateTicketDto } from './dto/rate-ticket.dto.js';

type UserRole = 'CLIENT' | 'OPERATOR' | 'ADMIN';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly presenceService: PresenceService,
  ) {}

  async createTickets(
    dto: СreateTicketDto,
    userId: string,
    role: UserRole = 'CLIENT',
  ) {
    if (role !== 'CLIENT') {
      throw new ForbiddenException('Тикет может создать только клиент');
    }
    const subject = dto.subject.trim();
    const message = dto.message.trim();
    if (subject.length < 3 || subject.length > 200) {
      throw new BadRequestException('Тема должна быть от 3 до 200 символов');
    }
    if (message.length < 1 || message.length > 4000) {
      throw new BadRequestException('Сообщение должно быть от 1 до 4000 символов');
    }

    const ticket = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.ticket.create({
        data: {
          subject,
          priority: dto.priority ?? 'NORMAL',
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

      await transaction.message.create({
        data: {
          ticketId: created.id,
          senderId: userId,
          body: message,
        },
      });

      return created;
    });

    this.realtimeEvents.emit('operators', 'ticket:created', ticket);
    this.realtimeEvents.emit(`user:${userId}`, 'ticket:created', ticket);
    await this.emitQueueStats();
    return ticket;
  }

  async getAllTickets(
    query: GetTicketsQueryDto,
    userId: string,
    role: UserRole,
  ) {
    const { status, assignedTo, page, limit } = query;

    if (role === 'CLIENT' && assignedTo) {
      throw new ForbiddenException('Клиент не может фильтровать назначенные тикеты');
    }

    const where: Prisma.TicketWhereInput = {
      ...(status && { status }),
      ...(role === 'CLIENT' ? { clientId: userId } : {}),
      ...((role === 'OPERATOR' || role === 'ADMIN') && assignedTo === 'me'
        ? { operatorId: userId }
        : {}),
    };

    const [tickets, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          client: { select: { name: true } },
          operator: { select: { name: true } },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { body: true, createdAt: true },
          },
        },
      }),

      this.prisma.ticket.count({ where }),
    ]);
    return {
      items: tickets.map(({ client, operator, messages, ...ticket }) => ({
        ...ticket,
        clientName: client.name,
        operatorName: operator?.name ?? null,
        lastMessage: messages[0] ?? null,
      })),
      total,
      page,
    };
  }

  async getTicket(ticketId: string, userId: string, role: UserRole) {
    await this.checkTicketAccess(ticketId, userId, role);
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        client: { select: { id: true, name: true, email: true } },
        operator: { select: { id: true, name: true, email: true } },
        rating: { select: { id: true, score: true, comment: true, createdAt: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Тикет не найден');
    }

    return ticket;
  }

  async checkTicketAccess(
    ticketId: string,
    userId: string,
    role: UserRole,
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
    role: UserRole,
  ) {
    if (role !== 'OPERATOR' && role !== 'ADMIN') {
      throw new ForbiddenException('Только оператор может взять тикет');
    }

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

    const ticket = await this.prisma.ticket.findUniqueOrThrow({
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

    const payload = {
      ticketId: ticket.id,
      operatorId: userId,
      status: ticket.status,
      takenAt: ticket.takenAt,
    };
    this.realtimeEvents.emit('operators', 'ticket:taken', payload);
    this.realtimeEvents.emit(`user:${ticket.clientId}`, 'ticket:taken', payload);
    await this.emitQueueStats();
    return ticket;
  }

  async closeTicket(
    ticketId: string,
    userId: string,
    role: UserRole,
    reason?: string,
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
        ...(reason ? { closeReason: reason.trim().slice(0, 500) } : {}),
      },
    });

    if (result.count === 0) {
      throw new ConflictException('Тикет уже закрыт или доступ изменился');
    }

    const closedTicket = await this.prisma.ticket.findUniqueOrThrow({
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

    const payload = {
      ticketId: closedTicket.id,
      status: closedTicket.status,
      closedAt: closedTicket.closedAt,
      closedById: closedTicket.closedById,
    };
    const rooms = [
      `ticket:${ticketId}`,
      'operators',
      `user:${closedTicket.clientId}`,
    ];
    if (closedTicket.operatorId) {
      rooms.push(`user:${closedTicket.operatorId}`);
    }
    this.realtimeEvents.emitRooms(rooms, 'ticket:closed', payload);
    await this.emitQueueStats();
    return closedTicket;
  }

  async rateTicket(ticketId: string, userId: string, dto: RateTicketDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, clientId: true, status: true },
    });

    if (!ticket) {
      throw new NotFoundException('Тикет не найден');
    }
    if (ticket.clientId !== userId) {
      throw new ForbiddenException('Оценить тикет может только его владелец');
    }
    if (ticket.status !== 'CLOSED') {
      throw new ConflictException('Оценить можно только закрытый тикет');
    }

    try {
      const rating = await this.prisma.ticketRating.create({
        data: {
          ticketId,
          score: dto.score,
          comment: dto.comment?.trim() || null,
        },
        select: { id: true, score: true, comment: true },
      });
      this.realtimeEvents.emit('operators', 'ticket:rated', {
        ticketId,
        ...rating,
      });
      return rating;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Тикет уже оценён');
      }
      throw error;
    }
  }

  async getStats() {
    const [open, inProgress] = await Promise.all([
      this.prisma.ticket.count({
        where: { status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS'] } },
      }),
      this.prisma.ticket.count({
        where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
      }),
    ]);

    return {
      open,
      inProgress,
      onlineOperators: this.presenceService.getOnlineOperatorsCount(),
    };
  }

  async emitQueueStats() {
    this.realtimeEvents.emit('operators', 'queue:stats', await this.getStats());
  }

  async getTicketParticipants(ticketId: string) {
    return this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { clientId: true, operatorId: true },
    });
  }

  async getActiveTicketIdsForUser(userId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        status: { not: 'CLOSED' },
        OR: [{ clientId: userId }, { operatorId: userId }],
      },
      select: { id: true },
    });
    return tickets.map(({ id }) => id);
  }
}
