import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { Request } from 'express';

type JwtPayload = {
  sub: number;
  email: string;
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
