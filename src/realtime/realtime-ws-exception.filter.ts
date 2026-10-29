import { ArgumentsHost, Catch } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';

@Catch(WsException)
export class RealtimeWsExceptionFilter {
  catch(exception: WsException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();
    const error = exception.getError();

    if (typeof error === 'string') {
      client.emit('error', { code: error, message: error });
      return;
    }

    const code =
      'code' in error && typeof error.code === 'string'
        ? error.code
        : 'WS_ERROR';
    const message =
      'message' in error && typeof error.message === 'string'
        ? error.message
        : 'Ошибка WebSocket-запроса';
    client.emit('error', { code, message });
  }
}
