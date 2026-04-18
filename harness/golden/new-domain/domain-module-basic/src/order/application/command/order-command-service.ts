import { randomUUID } from 'node:crypto'

import { Injectable } from '@nestjs/common'

import { Order } from '@/order/domain/order'
import { OrderRepository } from '@/order/domain/order-repository'
import { OrderErrorMessage } from '@/order/order-error-message'
import { CancelOrderCommand } from './cancel-order-command'
import { CreateOrderCommand } from './create-order-command'

@Injectable()
export class OrderCommandService {
  constructor(private readonly orderRepository: OrderRepository) {}

  public async createOrder(command: CreateOrderCommand): Promise<void> {
    const order = new Order({ orderId: randomUUID(), userId: command.userId, status: 'pending' })
    await this.orderRepository.saveOrder(order)
  }

  public async cancelOrder(command: CancelOrderCommand): Promise<void> {
    const order = await this.orderRepository
      .findOrders({ orderId: command.orderId, take: 1, page: 0 })
      .then((r) => r.orders.pop())
    if (!order) throw new Error(OrderErrorMessage['주문을 찾을 수 없습니다.'])
    order.cancel()
    await this.orderRepository.saveOrder(order)
  }
}
