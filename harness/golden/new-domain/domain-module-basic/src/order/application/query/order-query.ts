import { GetOrdersQuery } from './get-orders-query'
import { GetOrdersResult } from './get-orders-result'

export abstract class OrderQuery {
  abstract getOrders(query: GetOrdersQuery): Promise<GetOrdersResult>
}
