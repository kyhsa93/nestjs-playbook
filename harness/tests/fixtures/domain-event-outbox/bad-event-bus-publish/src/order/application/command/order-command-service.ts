import { Order } from '../../domain/order'

interface EventBusLike {
  publish: (event: object) => void
}

export class OrderCommandService {
  constructor(private readonly eventBus: EventBusLike) {}

  public async cancelOrder(orderId: string, reason: string): Promise<void> {
    const order = new Order(orderId, 'pending')
    order.cancel(reason)
    this.eventBus.publish({ orderId, reason })
  }
}
