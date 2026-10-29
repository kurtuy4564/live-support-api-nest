import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class RealtimeEventsService {
  private server?: Server;

  setServer(server: Server) {
    this.server = server;
  }

  emit(room: string, event: string, payload: unknown) {
    this.server?.to(room).emit(event, payload);
  }

  emitRooms(rooms: string[], event: string, payload: unknown) {
    this.server?.to(rooms).emit(event, payload);
  }

  disconnectUser(userId: string) {
    this.server?.in(`user:${userId}`).disconnectSockets(true);
  }
}
