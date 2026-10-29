import { Injectable } from '@nestjs/common';

@Injectable()
export class PresenceService {
  private readonly connections = new Map<string, Set<string>>();
  private readonly onlineOperators = new Set<string>();

  addConnection(
    userId: string,
    socketId: string,
    role: 'CLIENT' | 'OPERATOR' | 'ADMIN',
  ): boolean {
    let sockets = this.connections.get(userId);

    if (!sockets) {
      sockets = new Set<string>();
      this.connections.set(userId, sockets);
    }

    const wasOffline = sockets.size === 0;

    sockets.add(socketId);

    if (role === 'OPERATOR' || role === 'ADMIN') {
      this.onlineOperators.add(userId);
    }

    return wasOffline;
  }

  removeConnection(userId: string, socketId: string): boolean {
    const sockets = this.connections.get(userId);

    if (!sockets) {
      return false;
    }

    sockets.delete(socketId);

    if (sockets.size === 0) {
      this.connections.delete(userId);
      this.onlineOperators.delete(userId);
      return true;
    }

    return false;
  }

  isOnline(userId: string): boolean {
    return this.connections.has(userId);
  }

  getOnlineUserIds(): string[] {
    return [...this.connections.keys()];
  }

  getOnlineOperatorsCount(): number {
    return this.onlineOperators.size;
  }
}
