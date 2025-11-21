import { CustomerActivityStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCustomerActivityDto {
  @IsString()
  @MaxLength(191)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  detail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  channel?: string;

  @IsOptional()
  @IsEnum(CustomerActivityStatus)
  status?: CustomerActivityStatus;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}
