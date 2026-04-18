import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Order } from '@/order/domain/order'
import { OrderRepository } from '@/order/domain/order-repository'
import { OrderEntity } from '@/order/infrastructure/entity/order.entity'

@Injectable()
export class OrderRepositoryImpl extends OrderRepository {
  constructor(@InjectRepository(OrderEntity) private readonly orderRepo: Repository<OrderEntity>) {
    super()
  }

  public async findOrders(query: {
    readonly take: number
    readonly page: number
    readonly orderId?: string
    readonly userId?: string
  }): Promise<{ orders: Order[]; count: number }> {
    const qb = this.orderRepo.createQueryBuilder('o').take(query.take).skip(query.page * query.take)
    if (query.orderId) qb.andWhere('o.orderId = :orderId', { orderId: query.orderId })
    if (query.userId) qb.andWhere('o.userId = :userId', { userId: query.userId })
    const [rows, count] = await qb.getManyAndCount()
    return {
      orders: rows.map((r) => new Order({
        orderId: r.orderId,
        userId: r.userId,
        status: r.status as 'pending' | 'paid' | 'cancelled'
      })),
      count
    }
  }

  public async saveOrder(order: Order): Promise<void> {
    await this.orderRepo.save({ orderId: order.orderId, userId: order.userId, status: order.status })
  }
}
