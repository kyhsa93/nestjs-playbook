import { Order } from '../../domain/order'

export class OrderCommandService {
  public async cancelOrder(orderId: string, reason: string): Promise<void> {
    const order = new Order(orderId, 'pending')
    order.cancel(reason)
  }
}
