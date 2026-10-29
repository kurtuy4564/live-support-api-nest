import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { Request } from 'express';

type JwtPayload = {
  sub: string;
  email: string;
  role?: 'CLIENT' | 'OPERATOR' | 'ADMIN';
};

type AuthenticatedRequest = Request & {
  user?: JwtPayload;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user;
  },
);
