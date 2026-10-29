import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { TicketsService } from './tickets.service.js';

@Controller('support')
export class SupportController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  getStats() {
    return this.ticketsService.getStats();
  }
}
