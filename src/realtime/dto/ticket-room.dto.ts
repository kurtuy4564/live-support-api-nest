import { IsUUID } from 'class-validator';

export class TicketRoomDto {
  @IsUUID()
  ticketId: string;
}
