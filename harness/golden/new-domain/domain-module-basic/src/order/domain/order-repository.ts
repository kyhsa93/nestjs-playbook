import { Order } from './order'

export abstract class OrderRepository {
  abstract findOrders(query: {
    readonly take: number
    readonly page: number
    readonly orderId?: string
    readonly userId?: string
  }): Promise<{ orders: Order[]; count: number }>
  abstract saveOrder(order: Order): Promise<void>
}
