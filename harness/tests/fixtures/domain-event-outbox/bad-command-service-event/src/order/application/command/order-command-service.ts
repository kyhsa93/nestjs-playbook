import { Order, OrderCancelled } from '../../domain/order'

export class OrderCommandService {
  public async cancelOrder(orderId: string, reason: string): Promise<void> {
    const order = new Order(orderId, 'pending')
    order.cancel(reason)
    const evt = new OrderCancelled(orderId, reason)
    void evt
  }
}
