import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import type { Server } from 'socket.io';

import type {
  AuthenticatedSocket,
  SocketUser,
} from './interfaces/authenticated-socket.interface.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { TicketRoomDto } from './dto/ticket-room.dto.js';
import { RealtimeAuthService } from './realtime-auth.service.js';

@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly ticketsService: TicketsService,
    private readonly realtimeAuthService: RealtimeAuthService,
  ) {}

  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        const user = await this.realtimeAuthService.authenticate(
          socket.handshake.auth.token,
        );

        socket.data.user = user;

        next();
      } catch {
        next(new Error('UNAUTHORIZED'));
      }
    });
  }

  async handleConnection(client: AuthenticatedSocket) {
    const user = client.data.user;

    if (!user) {
      client.disconnect(true);
      return;
    }

    await client.join(`user:${user.sub}`);

    if (user.role === 'OPERATOR' || user.role === 'ADMIN') {
      await client.join('operators');
    }

    this.logger.log(`Подключился ${user.email}, роль: ${user.role}`);
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Отключился сокет: ${client.id}`);
  }

  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: () =>
        new WsException({
          code: 'VALIDATION_ERROR',
          message: 'Некорректный ticketId',
        }),
    }),
  )
  @SubscribeMessage('ticket:join')
  async handleTicketJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: TicketRoomDto,
  ) {
    const user = client.data.user;

    if (!user) {
      throw new WsException({
        code: 'UNAUTHORIZED',
        message: 'Пользователь не авторизован',
      });
    }

    try {
      await this.ticketsService.checkTicketAccess(
        dto.ticketId,
        user.sub,
        user.role,
      );
    } catch {
      throw new WsException({
        code: 'ACCESS_DENIED',
        message: 'Тикет не найден или доступ запрещён',
      });
    }

    await client.join(`ticket:${dto.ticketId}`);

    client.emit('ticket:joined', {
      ticketId: dto.ticketId,
    });
  }

  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: () =>
        new WsException({
          code: 'VALIDATION_ERROR',
          message: 'Некорректный ticketId',
        }),
    }),
  )
  @SubscribeMessage('ticket:leave')
  async handleTicketLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: TicketRoomDto,
  ) {
    if (!client.data.user) {
      throw new WsException({
        code: 'UNAUTHORIZED',
        message: 'Пользователь не авторизован',
      });
    }

    await client.leave(`ticket:${dto.ticketId}`);

    client.emit('ticket:left', {
      ticketId: dto.ticketId,
    });
  }
}
