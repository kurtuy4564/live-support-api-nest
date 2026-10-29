import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import type { SocketUser } from '../realtime/interfaces/authenticated-socket.interface.js';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

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
      throw new ConflictException('Сообщение не может быть пустым');
    }

    return this.prisma.message.create({
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
      },
    });
  }
}
