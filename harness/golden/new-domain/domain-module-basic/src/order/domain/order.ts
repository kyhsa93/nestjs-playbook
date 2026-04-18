import { OrderErrorMessage } from '../order-error-message'

export class Order {
  public readonly orderId: string
  public readonly userId: string
  private _status: 'pending' | 'paid' | 'cancelled'

  constructor(params: { orderId: string; userId: string; status: 'pending' | 'paid' | 'cancelled' }) {
    if (!params.userId) throw new Error(OrderErrorMessage['사용자 ID는 필수입니다.'])
    this.orderId = params.orderId
    this.userId = params.userId
    this._status = params.status
  }

  get status(): 'pending' | 'paid' | 'cancelled' { return this._status }

  public cancel(): void {
    if (this._status === 'cancelled') throw new Error(OrderErrorMessage['이미 취소된 주문입니다.'])
    this._status = 'cancelled'
  }
}
