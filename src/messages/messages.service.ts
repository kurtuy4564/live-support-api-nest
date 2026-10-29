import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import type { SocketUser } from '../realtime/interfaces/authenticated-socket.interface.js';
import { TicketsService } from '../tickets/tickets.service.js';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsService: TicketsService,
  ) {}

  async sendMessage(ticketId: string, body: string, user: SocketUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
        clientId: true,
        operatorId: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Тикет не найден');
    }

    const isClient = user.role === 'CLIENT' && ticket.clientId === user.sub;

    const isOperator =
      user.role === 'OPERATOR' && ticket.operatorId === user.sub;

    const isAdmin = user.role === 'ADMIN';

    if (!isClient && !isOperator && !isAdmin) {
      throw new ForbiddenException('Нет доступа к тикету');
    }

    if (ticket.status === 'CLOSED') {
      throw new ConflictException('Тикет уже закрыт');
    }

    if (!body.trim()) {
      throw new BadRequestException('Сообщение не может быть пустым');
    }

    const message = await this.prisma.message.create({
      data: {
        ticketId,
        senderId: user.sub,
        body: body.trim(),
      },
      select: {
        id: true,
        ticketId: true,
        senderId: true,
        body: true,
        createdAt: true,
        sender: { select: { role: true } },
      },
    });
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { updatedAt: new Date() },
    });

    const { sender, ...messageData } = message;
    return { ...messageData, senderRole: sender.role };
  }

  async getMessages(
    ticketId: string,
    userId: string,
    role: SocketUser['role'],
    cursor: string | undefined,
    limit: number,
  ) {
    await this.ticketsService.checkTicketAccess(ticketId, userId, role);

    let cursorFilter = {};
    if (cursor) {
      const separator = cursor.indexOf('_');
      const timestamp = Number(cursor.slice(0, separator));
      const id = cursor.slice(separator + 1);
      const createdAt = new Date(timestamp);

      if (
        separator < 1 ||
        !Number.isInteger(timestamp) ||
        Number.isNaN(createdAt.getTime()) ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
      ) {
        throw new BadRequestException('Некорректный cursor');
      }

      cursorFilter = {
        OR: [
          { createdAt: { lt: createdAt } },
          { createdAt, id: { lt: id } },
        ],
      };
    }

    const messages = await this.prisma.message.findMany({
      where: { ticketId, ...cursorFilter },
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        senderId: true,
        body: true,
        createdAt: true,
        sender: { select: { role: true } },
      },
    });

    const hasMore = messages.length > limit;
    const items = messages.slice(0, limit).map(({ sender, ...message }) => ({
      ...message,
      senderRole: sender.role,
    }));
    const last = hasMore ? items.at(-1) : undefined;
    const nextCursor = last
      ? `${last.createdAt.getTime()}_${last.id}`
      : null;

    return { items, nextCursor };
  }
}
