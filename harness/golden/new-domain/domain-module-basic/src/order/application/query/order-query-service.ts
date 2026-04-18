import { Injectable } from '@nestjs/common'

import { GetOrdersQuery } from './get-orders-query'
import { GetOrdersResult } from './get-orders-result'
import { OrderQuery } from './order-query'

@Injectable()
export class OrderQueryService {
  constructor(private readonly orderQuery: OrderQuery) {}

  public async getOrders(query: GetOrdersQuery): Promise<GetOrdersResult> {
    return this.orderQuery.getOrders(query)
  }
}
