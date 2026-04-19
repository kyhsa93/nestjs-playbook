function HandleEvent(_eventType: string): MethodDecorator {
  return () => undefined
}

export class OrderCancelledHandler {
  @HandleEvent('OrderCancelled')
  public async handle(_event: { orderId: string; reason: string }): Promise<void> {}
}
