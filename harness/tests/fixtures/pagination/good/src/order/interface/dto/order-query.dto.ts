import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Min } from 'class-validator'

export class OrderQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page: number = 0

  @Type(() => Number)
  @IsInt()
  @Min(1)
  take: number = 20

  @IsOptional()
  @IsString()
  sort?: string
}
