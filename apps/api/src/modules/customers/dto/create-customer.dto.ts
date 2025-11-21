import { CustomerHealth, CustomerSegment } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCustomerContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  channel?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;
}

export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  name!: string;

  @IsEnum(CustomerSegment)
  segment!: CustomerSegment;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  ownerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @IsEnum(CustomerHealth)
  health?: CustomerHealth;

  @IsInt()
  @Min(0)
  mrrCents!: number;

  @IsOptional()
  @IsDateString()
  lastContactAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  nextStep?: string;

  @IsOptional()
  @IsDateString()
  nextStepDueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  decisionStage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  preferredChannel?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCustomerContactDto)
  contacts?: CreateCustomerContactDto[];
}
