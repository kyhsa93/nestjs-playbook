export class OrderCancelled {
  constructor(public readonly orderId: string, public readonly reason: string) {}
}

export class Order {
  private readonly _events: OrderCancelled[] = []

  constructor(public readonly orderId: string, private _status: string) {}

  public get domainEvents(): OrderCancelled[] { return [...this._events] }

  public cancel(reason: string): void {
    this._status = 'cancelled'
    this._events.push(new OrderCancelled(this.orderId, reason))
  }

  public clearEvents(): void { this._events.length = 0 }
}
