import {
  IsByteLength,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

enum TicketPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class СreateTicketDto {
  @IsString()
  @IsByteLength(3, 200)
  subject: string;

  @IsString()
  @IsByteLength(1, 4000)
  message: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}