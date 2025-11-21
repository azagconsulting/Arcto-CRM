import { CustomerHealth, CustomerSegment } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCustomersDto {
  @IsOptional()
  @IsEnum(CustomerSegment)
  segment?: CustomerSegment;

  @IsOptional()
  @IsEnum(CustomerHealth)
  health?: CustomerHealth;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
