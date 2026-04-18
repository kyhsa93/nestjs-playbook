import { ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'

export class CancelOrderCommand {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  public readonly orderId: string

  constructor(command: CancelOrderCommand) { Object.assign(this, command) }
}
