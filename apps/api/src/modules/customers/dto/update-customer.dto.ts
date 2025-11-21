import { CustomerHealth, CustomerSegment } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCustomerContactDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  channel?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string | null;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  name?: string;

  @IsOptional()
  @IsEnum(CustomerSegment)
  segment?: CustomerSegment;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  ownerName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string | null;

  @IsOptional()
  @IsEnum(CustomerHealth)
  health?: CustomerHealth;

  @IsOptional()
  @IsInt()
  @Min(0)
  mrrCents?: number;

  @IsOptional()
  @IsDateString()
  lastContactAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  nextStep?: string | null;

  @IsOptional()
  @IsDateString()
  nextStepDueAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  decisionStage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  preferredChannel?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCustomerContactDto)
  primaryContact?: UpdateCustomerContactDto;
}
