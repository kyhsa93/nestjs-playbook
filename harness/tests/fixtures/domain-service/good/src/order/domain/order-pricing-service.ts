import { Order } from './order'

export class OrderPricingService {
  calculateTotal(order: Order): number {
    return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }
}
