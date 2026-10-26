import { Injectable } from '@nestjs/common';
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
}
