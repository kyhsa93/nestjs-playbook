import { ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'

export class CreateOrderCommand {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  public readonly userId: string

  constructor(command: CreateOrderCommand) { Object.assign(this, command) }
}
