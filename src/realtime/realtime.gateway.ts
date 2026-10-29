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
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Server } from 'socket.io';

import type {
  AuthenticatedSocket,
  SocketUser,
} from './interfaces/authenticated-socket.interface.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { TicketRoomDto } from './dto/ticket-room.dto.js';
import { RealtimeAuthService } from './realtime-auth.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { SendMessageDto } from './dto/send-message.dto.js';

@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  private readonly typingStates = new Map<
    string,
    {
      timer: NodeJS.Timeout;
      lastEmittedAt: number;
    }
  >();

  private readonly TYPING_TIMEOUT_MS = 3000;
  private readonly TYPING_THROTTLE_MS = 2000;

  private getTypingKey(socketId: string, ticketId: string) {
    return `${socketId}:${ticketId}`;
  }

  private stopTyping(client: AuthenticatedSocket, ticketId: string) {
    const key = this.getTypingKey(client.id, ticketId);
    const state = this.typingStates.get(key);

    if (!state) {
      return;
    }

    clearTimeout(state.timer);
    this.typingStates.delete(key);

    const user = client.data.user;

    if (!user) {
      return;
    }

    client.to(`ticket:${ticketId}`).emit('typing:update', {
      ticketId,
      userId: user.sub,
      isTyping: false,
    });
  }

  constructor(
    private readonly ticketsService: TicketsService,
    private readonly realtimeAuthService: RealtimeAuthService,
    private readonly messagesService: MessagesService,
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
    for (const key of this.typingStates.keys()) {
      if (!key.startsWith(`${client.id}:`)) {
        continue;
      }

      const ticketId = key.slice(client.id.length + 1);
      this.stopTyping(client, ticketId);
    }

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

  @SubscribeMessage('message:send')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: () =>
        new WsException({
          code: 'VALIDATION_ERROR',
          message: 'Некорректные данные сообщения',
        }),
    }),
  )
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const user = client.data.user;

    if (!user) {
      throw new WsException({
        code: 'UNAUTHORIZED',
        message: 'Пользователь не авторизован',
      });
    }

    // Проверяем, что сокет действительно находится в комнате
    const room = `ticket:${dto.ticketId}`;

    if (!client.rooms.has(room)) {
      throw new WsException({
        code: 'NOT_IN_ROOM',
        message: 'Сначала подключитесь к комнате тикета',
      });
    }

    let message;

    try {
      message = await this.messagesService.sendMessage(
        dto.ticketId,
        dto.body,
        user,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw new WsException({
          code: 'MESSAGE_REJECTED',
          message: error.message,
        });
      }

      throw error;
    }

    this.server.to(room).emit('message:new', message);

    return {
      event: 'message:sent',
      data: { id: message.id },
    };
  }

  @SubscribeMessage('ticket:take')
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
  async handleTicketTake(
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

    let ticket;

    try {
      ticket = await this.ticketsService.takeTicket(
        dto.ticketId,
        user.sub,
        user.role,
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new WsException({
          code: 'FORBIDDEN',
          message: error.message,
        });
      }

      if (error instanceof NotFoundException) {
        throw new WsException({
          code: 'NOT_FOUND',
          message: error.message,
        });
      }

      if (error instanceof ConflictException) {
        throw new WsException({
          code: 'ALREADY_TAKEN',
          message: 'Тикет уже занят или недоступен',
        });
      }

      throw error;
    }

    // Подключаем оператора к комнате тикета
    await client.join(`ticket:${ticket.id}`);

    const payload = {
      ticketId: ticket.id,
      operatorId: user.sub,
      status: ticket.status,
      takenAt: ticket.takenAt,
    };

    // Обновляем очередь у всех операторов
    this.server.to('operators').emit('ticket:taken', payload);

    // Уведомляем клиента
    this.server.to(`user:${ticket.clientId}`).emit('ticket:taken', payload);

    return {
      event: 'ticket:take:success',
      data: payload,
    };
  }

  @SubscribeMessage('ticket:close')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: () =>
        new WsException({
          code: 'VALIDATION_ERROR',
          message: 'Некорректный ticketId',
        }),
    }),
  )
  async handleTicketClose(
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

    let ticket;

    try {
      ticket = await this.ticketsService.closeTicket(
        dto.ticketId,
        user.sub,
        user.role,
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new WsException({
          code: 'FORBIDDEN',
          message: error.message,
        });
      }

      if (error instanceof NotFoundException) {
        throw new WsException({
          code: 'NOT_FOUND',
          message: error.message,
        });
      }

      if (error instanceof ConflictException) {
        throw new WsException({
          code: 'ALREADY_CLOSED',
          message: error.message,
        });
      }

      throw error;
    }

    const payload = {
      ticketId: ticket.id,
      status: ticket.status,
      closedAt: ticket.closedAt,
      closedById: ticket.closedById,
    };

    // Участники, находящиеся в комнате тикета
    this.server.to(`ticket:${ticket.id}`).emit('ticket:closed', payload);

    // Операторы, отслеживающие очередь
    this.server.to('operators').emit('ticket:closed', payload);

    // Клиент, даже если он не открыл чат
    this.server.to(`user:${ticket.clientId}`).emit('ticket:closed', payload);

    // Назначенный оператор, даже если он не открыл чат
    if (ticket.operatorId) {
      this.server
        .to(`user:${ticket.operatorId}`)
        .emit('ticket:closed', payload);
    }

    return {
      event: 'ticket:close:success',
      data: payload,
    };
  }

  @SubscribeMessage('typing:start')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: () =>
        new WsException({
          code: 'VALIDATION_ERROR',
          message: 'Некорректный ticketId',
        }),
    }),
  )
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: TicketRoomDto,
  ) {
    const user = client.data.user;

    if (!user) {
      throw new WsException('UNAUTHORIZED');
    }

    const room = `ticket:${dto.ticketId}`;

    if (!client.rooms.has(room)) {
      throw new WsException('NOT_IN_ROOM');
    }

    // Проверяем актуальные права на тикет
    await this.ticketsService.checkTicketAccess(
      dto.ticketId,
      user.sub,
      user.role,
    );

    const key = this.getTypingKey(client.id, dto.ticketId);
    const existing = this.typingStates.get(key);
    const now = Date.now();

    // Продлеваем срок действия индикатора
    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
      this.stopTyping(client, dto.ticketId);
    }, this.TYPING_TIMEOUT_MS);

    this.typingStates.set(key, {
      timer,
      lastEmittedAt: existing?.lastEmittedAt ?? 0,
    });

    // Ограничиваем частоту отправки повторных событий
    if (existing && now - existing.lastEmittedAt < this.TYPING_THROTTLE_MS) {
      return;
    }

    this.typingStates.get(key)!.lastEmittedAt = now;

    client.to(room).emit('typing:update', {
      ticketId: dto.ticketId,
      userId: user.sub,
      isTyping: true,
    });
  }

  @SubscribeMessage('typing:stop')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: () =>
        new WsException({
          code: 'VALIDATION_ERROR',
          message: 'Некорректный ticketId',
        }),
    }),
  )
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: TicketRoomDto,
  ) {
    if (!client.data.user) {
      throw new WsException('UNAUTHORIZED');
    }

    const room = `ticket:${dto.ticketId}`;

    if (!client.rooms.has(room)) {
      throw new WsException('NOT_IN_ROOM');
    }

    this.stopTyping(client, dto.ticketId);
  }
}
