import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendCustomerMessageDto {
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsEmail()
  toEmail?: string;

  @IsOptional()
  @IsEmail()
  fromEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  preview?: string;

  @IsString()
  @IsNotEmpty()
  body!: string;
}
