import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  it('accepts bearer tokens with case and whitespace variations', async () => {
    const jwtService = new JwtService({ secret: 'test-secret' });
    const verifyAsync = vi
      .spyOn(jwtService, 'verifyAsync')
      .mockResolvedValue({ sub: 1, email: 'user@example.com' });
    const guard = new JwtAuthGuard(jwtService);
    const request = {
      headers: { authorization: 'bearer   test-token  ' },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyAsync).toHaveBeenCalledWith('test-token');
  });
});
