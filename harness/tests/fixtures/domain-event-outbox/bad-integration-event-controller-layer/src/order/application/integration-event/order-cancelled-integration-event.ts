export class OrderCancelledIntegrationEventV1 {
  public readonly eventName = 'order.cancelled.v1' as const

  constructor(
    public readonly orderId: string,
    public readonly cancelledAt: string,
    public readonly reason: string
  ) {}
}
