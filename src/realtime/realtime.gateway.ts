import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import type {
  AuthenticatedSocket,
  SocketUser,
} from './interfaces/authenticated-socket.interface.js';

@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth.token;

      if (typeof token !== 'string' || !token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<SocketUser>(token);

      if (!payload.sub || !payload.email || !payload.role) {
        client.disconnect(true);
        return;
      }

      client.data.user = {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
      };

      console.log(`Подключился пользователь: ${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Отключился клиент: ${client.id}`);
  }
}
