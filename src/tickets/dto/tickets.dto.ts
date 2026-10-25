import { IsByteLength, IsEmail, IsString, MinLength } from 'class-validator';

export class СreateTicketDto {
  @IsString()
  @IsByteLength(3, 200)
  subject: string;

  @IsString()
  @IsByteLength(1, 4000)
  message: string;
}