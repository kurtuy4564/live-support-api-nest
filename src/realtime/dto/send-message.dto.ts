import { IsString, IsUUID, Length } from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  ticketId: string;

  @IsString()
  @Length(1, 4000)
  body: string;
}
