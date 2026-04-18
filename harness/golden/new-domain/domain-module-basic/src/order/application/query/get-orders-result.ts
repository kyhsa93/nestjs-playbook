import { ApiProperty } from '@nestjs/swagger'

export class OrderSummaryItem {
  @ApiProperty() public readonly orderId: string
  @ApiProperty() public readonly userId: string
  @ApiProperty() public readonly status: string
}

export class GetOrdersResult {
  @ApiProperty({ type: [OrderSummaryItem] })
  public readonly orders: OrderSummaryItem[]

  @ApiProperty()
  public readonly totalCount: number
}
