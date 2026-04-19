function HandleIntegrationEvent(_eventName: string): MethodDecorator {
  return () => undefined
}

export class OrderIntegrationEventController {
  @HandleIntegrationEvent('payment.approved.v1')
  public async onPaymentApproved(_event: { orderId: string }): Promise<void> {}
}
