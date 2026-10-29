import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { TicketsService } from './tickets.service.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { СreateTicketDto } from './dto/tickets.dto.js';
import { GetTicketsQueryDto } from './dto/get-tickets-query.dto.js';
import { RateTicketDto } from './dto/rate-ticket.dto.js';

type AuthenticatedUser = {
  sub: string;
  email: string;
  role?: 'CLIENT' | 'OPERATOR' | 'ADMIN';
};

class CloseTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  createTickets(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: СreateTicketDto,
  ) {
    return this.ticketsService.createTickets(
      dto,
      user.sub,
      user.role ?? 'CLIENT',
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getAllTickets(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetTicketsQueryDto,
  ) {
    return this.ticketsService.getAllTickets(
      query,
      user.sub,
      user.role ?? 'CLIENT',
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') ticketId: string,
  ) {
    return this.ticketsService.getTicket(
      ticketId,
      user.sub,
      user.role ?? 'CLIENT',
    );
  }

  @Patch(':id/close')
  @UseGuards(JwtAuthGuard)
  async closeTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') ticketId: string,
    @Body() dto: CloseTicketDto,
  ) {
    const { id, status, closedAt } = await this.ticketsService.closeTicket(
      ticketId,
      user.sub,
      user.role ?? 'CLIENT',
      dto.reason,
    );
    return { id, status, closedAt };
  }

  @Post(':id/rating')
  @UseGuards(JwtAuthGuard)
  rateTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') ticketId: string,
    @Body() dto: RateTicketDto,
  ) {
    return this.ticketsService.rateTicket(ticketId, user.sub, dto);
  }
}
