import type { Socket } from 'socket.io';

export interface SocketUser {
  sub: string;
  email: string;
  role: 'CLIENT' | 'OPERATOR' | 'ADMIN';
}

export interface AuthenticatedSocket extends Socket {
  data: {
    user?: SocketUser;
  };
}
