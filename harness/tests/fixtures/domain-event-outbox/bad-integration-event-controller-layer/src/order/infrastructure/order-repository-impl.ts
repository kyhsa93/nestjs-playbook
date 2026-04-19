import { OutboxWriter } from '@/outbox/outbox-writer'
import { Order } from '../domain/order'

export class OrderRepositoryImpl {
  constructor(private readonly outboxWriter: OutboxWriter) {}

  public async saveOrder(order: Order): Promise<void> {
    await this.outboxWriter.saveAll(order.domainEvents)
    order.clearEvents()
  }
}
