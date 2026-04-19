import { OutboxWriter } from '@/outbox/outbox-writer'
import { Order } from '../../domain/order'

export class OrderCommandService {
  constructor(private readonly outboxWriter: OutboxWriter) {}

  public async cancelOrder(orderId: string, reason: string): Promise<void> {
    const order = new Order(orderId, 'pending')
    order.cancel(reason)
    await this.outboxWriter.saveAll(order.domainEvents)
  }
}
