import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { СreateTicketDto } from './dto/tickets.dto.js';
import { GetTicketsQueryDto } from './dto/get-tickets-query.dto.js';

type AuthenticatedUser = {
  sub: string;
  email: string;
};

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  getTickets(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: СreateTicketDto,
  ) {
    return this.ticketsService.getTickets(dto, user.sub);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getAllTickets(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetTicketsQueryDto,
  ) {
    return this.ticketsService.getAllTickets(query, user.sub);
  }
}
