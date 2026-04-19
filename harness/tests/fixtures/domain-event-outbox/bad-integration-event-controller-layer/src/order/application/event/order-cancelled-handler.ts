import { OutboxWriter } from '@/outbox/outbox-writer'
import { OrderCancelledIntegrationEventV1 } from '../integration-event/order-cancelled-integration-event'

function HandleEvent(_eventType: string): MethodDecorator {
  return () => undefined
}

export class OrderCancelledHandler {
  constructor(private readonly outboxWriter: OutboxWriter) {}

  @HandleEvent('OrderCancelled')
  public async handle(event: { orderId: string; reason: string }): Promise<void> {
    await this.outboxWriter.saveAll([
      new OrderCancelledIntegrationEventV1(event.orderId, new Date().toISOString(), event.reason)
    ])
  }
}
